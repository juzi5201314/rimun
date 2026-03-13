import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, win32 } from "node:path";
import {
  buildModLibraryFromSnapshot,
  parseModsConfigXml,
  replaceActiveModsBlock,
} from "@rimun/domain";
import type {
  AppError,
  ExecutionEnvironment,
  ModLibraryResult,
  ModSource,
  ModSourceSnapshot,
  ModSourceSnapshotEntry,
  PathSelection,
} from "@rimun/shared";
import { getExecutionEnvironment, windowsPathToWslPath } from "./platform";

export { parseAboutXml, parseModsConfigXml } from "@rimun/domain";

type ScanTask = {
  entryName: string;
  modReadablePath: string;
  modWindowsPath: string;
  source: ModSource;
};

type ScannedModFragment = ModSourceSnapshotEntry & {
  entryName: string;
};

type ScanChunkRequest = {
  chunkId: number;
  tasks: ScanTask[];
};

type ScanChunkResponse = {
  chunkId: number;
  error: string | null;
  fragments: ScannedModFragment[];
  metrics: {
    parseMs: number;
    readMs: number;
  };
};

type WorkerScanMetrics = {
  parseMs: number;
  readMs: number;
  startupMs: number;
};

type ScanModLibraryOptions = {
  activePackageIdsOverride?: string[];
  environment?: ExecutionEnvironment;
  runWorkerChunks?: (
    chunks: ScanTask[][],
    poolSize: number,
  ) => Promise<{
    fragments: ScannedModFragment[];
    metrics: WorkerScanMetrics;
  }>;
  toReadablePath?: (windowsPath: string) => string | null;
};

type ParsedModsConfig = {
  activePackageIds: Set<string>;
  activePackageIdsOrdered: string[];
};

type XmlEncoding = "utf8" | "utf16le" | "utf16be";

type WriteActiveModsOptions = {
  environment?: ExecutionEnvironment;
  toReadablePath?: (windowsPath: string) => string | null;
};

const SCAN_CHUNK_SIZE = 24;

type ModScanProfile = {
  buildResultMs: number;
  configMs: number;
  workerOverheadMs: number;
  workerParseMs: number;
  workerReadMs: number;
  workerStartupMs: number;
  rootEnumMs: number;
  totalMs: number;
  workerMs: number;
};

function createAppError(
  code: AppError["code"],
  message: string,
  detail: string | null,
  recoverable: boolean,
): AppError {
  return {
    code,
    message,
    detail,
    recoverable,
  };
}

function decodeUtf16Le(fileContent: Uint8Array) {
  return Buffer.from(fileContent).toString("utf16le");
}

function createParsedActivePackageIds(
  activePackageIds: string[],
): ParsedModsConfig {
  const normalizedActivePackageIds: string[] = [];
  const seen = new Set<string>();

  for (const packageId of activePackageIds) {
    const normalizedPackageId = packageId.trim().toLowerCase();

    if (!normalizedPackageId || seen.has(normalizedPackageId)) {
      continue;
    }

    seen.add(normalizedPackageId);
    normalizedActivePackageIds.push(normalizedPackageId);
  }

  return {
    activePackageIds: new Set(normalizedActivePackageIds),
    activePackageIdsOrdered: normalizedActivePackageIds,
  };
}

function decodeUtf16Be(fileContent: Uint8Array) {
  const swapped = Buffer.from(fileContent);

  for (let index = 0; index + 1 < swapped.length; index += 2) {
    const current = swapped[index];
    swapped[index] = swapped[index + 1] ?? current;
    swapped[index + 1] = current;
  }

  return swapped.toString("utf16le");
}

function encodeUtf16Be(value: string) {
  const buffer = Buffer.from(value, "utf16le");

  for (let index = 0; index + 1 < buffer.length; index += 2) {
    const current = buffer[index];
    buffer[index] = buffer[index + 1] ?? current;
    buffer[index + 1] = current;
  }

  return buffer;
}

function detectXmlEncoding(fileContent: Uint8Array): XmlEncoding {
  if (
    fileContent.length >= 2 &&
    fileContent[0] === 0xff &&
    fileContent[1] === 0xfe
  ) {
    return "utf16le";
  }

  if (
    fileContent.length >= 2 &&
    fileContent[0] === 0xfe &&
    fileContent[1] === 0xff
  ) {
    return "utf16be";
  }

  return "utf8";
}

export function decodeXmlFileContent(fileContent: Uint8Array) {
  if (
    fileContent.length >= 2 &&
    fileContent[0] === 0xff &&
    fileContent[1] === 0xfe
  ) {
    return decodeUtf16Le(fileContent.subarray(2));
  }

  if (
    fileContent.length >= 2 &&
    fileContent[0] === 0xfe &&
    fileContent[1] === 0xff
  ) {
    return decodeUtf16Be(fileContent.subarray(2));
  }

  if (
    fileContent.length >= 3 &&
    fileContent[0] === 0xef &&
    fileContent[1] === 0xbb &&
    fileContent[2] === 0xbf
  ) {
    return new TextDecoder("utf-8").decode(fileContent);
  }

  const sampleSize = Math.min(
    fileContent.length - (fileContent.length % 2),
    128,
  );
  let zeroOnEven = 0;
  let zeroOnOdd = 0;

  for (let index = 0; index < sampleSize; index += 2) {
    if (fileContent[index] === 0) {
      zeroOnEven += 1;
    }

    if (fileContent[index + 1] === 0) {
      zeroOnOdd += 1;
    }
  }

  if (sampleSize > 0) {
    const pairCount = sampleSize / 2;

    if (zeroOnOdd / pairCount > 0.3) {
      return decodeUtf16Le(fileContent);
    }

    if (zeroOnEven / pairCount > 0.3) {
      return decodeUtf16Be(fileContent);
    }
  }

  return new TextDecoder("utf-8").decode(fileContent);
}

async function readXmlFile(filePath: string) {
  return decodeXmlFileContent(await Bun.file(filePath).bytes());
}

function readXmlFileWithEncoding(filePath: string) {
  const fileContent = readFileSync(filePath);

  return {
    encoding: detectXmlEncoding(fileContent),
    xml: decodeXmlFileContent(fileContent),
  };
}

function encodeXmlContent(xml: string, encoding: XmlEncoding) {
  if (encoding === "utf16le") {
    return Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(xml, "utf16le"),
    ]);
  }

  if (encoding === "utf16be") {
    return Buffer.concat([Buffer.from([0xfe, 0xff]), encodeUtf16Be(xml)]);
  }

  return Buffer.from(xml, "utf8");
}

export function createReadablePathResolver() {
  if (process.platform === "win32") {
    return (windowsPath: string) => windowsPath;
  }

  return windowsPathToWslPath;
}

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isMissingFileError(error: unknown) {
  return (
    isNodeErrorWithCode(error) &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function chunkTasks(tasks: ScanTask[]) {
  const chunks: ScanTask[][] = [];

  for (let index = 0; index < tasks.length; index += SCAN_CHUNK_SIZE) {
    chunks.push(tasks.slice(index, index + SCAN_CHUNK_SIZE));
  }

  return chunks;
}

function getWorkerPoolSize(environment: ExecutionEnvironment) {
  const _environment = environment;
  void _environment;

  return Math.max(2, availableParallelism());
}

function formatDurationMs(value: number) {
  return `${value.toFixed(1)}ms`;
}

function logModScanProfile(args: {
  errors: AppError[];
  modsCount: number;
  notesCount: number;
  poolSize: number;
  profile: ModScanProfile;
  taskCount: number;
}) {
  const { errors, modsCount, notesCount, poolSize, profile, taskCount } = args;

  console.log(
    `[mod-scan] total=${formatDurationMs(profile.totalMs)} mods=${modsCount} tasks=${taskCount} pool=${poolSize} errs=${errors.length} notes=${notesCount}`,
  );
  console.log(
    `[mod-scan] config=${formatDurationMs(profile.configMs)} roots=${formatDurationMs(profile.rootEnumMs)} workers=${formatDurationMs(profile.workerMs)} build=${formatDurationMs(profile.buildResultMs)}`,
  );
  console.log(
    `[mod-scan-worker] startup=${formatDurationMs(profile.workerStartupMs)} read=${formatDurationMs(profile.workerReadMs)} parse=${formatDurationMs(profile.workerParseMs)} overhead=${formatDurationMs(profile.workerOverheadMs)}`,
  );
}

async function scanModTask(task: ScanTask) {
  const aboutReadablePath = join(task.modReadablePath, "About", "About.xml");
  const aboutWindowsPath = win32.join(
    task.modWindowsPath,
    "About",
    "About.xml",
  );

  try {
    const aboutXmlText = await readXmlFile(aboutReadablePath);

    return {
      entryName: task.entryName,
      hasAboutXml: true,
      manifestPath: aboutWindowsPath,
      aboutXmlText,
      modReadablePath: task.modReadablePath,
      modWindowsPath: task.modWindowsPath,
      notes: [],
      source: task.source,
    } satisfies ScannedModFragment;
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        entryName: task.entryName,
        hasAboutXml: false,
        manifestPath: null,
        aboutXmlText: null,
        modReadablePath: task.modReadablePath,
        modWindowsPath: task.modWindowsPath,
        notes: ["About/About.xml was not found."],
        source: task.source,
      } satisfies ScannedModFragment;
    }

    return {
      entryName: task.entryName,
      hasAboutXml: true,
      manifestPath: aboutWindowsPath,
      aboutXmlText: null,
      modReadablePath: task.modReadablePath,
      modWindowsPath: task.modWindowsPath,
      notes: [`About/About.xml could not be read: ${toErrorMessage(error)}`],
      source: task.source,
    } satisfies ScannedModFragment;
  }
}

async function scanModTasksInProcess(tasks: ScanTask[]) {
  return Promise.all(tasks.map((task) => scanModTask(task)));
}

async function listRootScanTasks(
  source: ModSource,
  rootWindowsPath: string | null,
  toReadablePath: (windowsPath: string) => string | null,
  errors: AppError[],
  options: {
    requireAboutXml?: boolean;
  } = {},
) {
  if (!rootWindowsPath) {
    return [];
  }

  const readableRoot = toReadablePath(rootWindowsPath);

  if (!readableRoot) {
    errors.push(
      createAppError(
        "environment_error",
        `Unable to map ${source} path into the current runtime.`,
        rootWindowsPath,
        true,
      ),
    );
    return [];
  }

  try {
    const entries = await readdir(readableRoot, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .filter((entry) =>
        options.requireAboutXml
          ? existsSync(join(readableRoot, entry.name, "About", "About.xml"))
          : true,
      )
      .map((entry) => ({
        entryName: entry.name,
        modReadablePath: join(readableRoot, entry.name),
        modWindowsPath: win32.join(rootWindowsPath, entry.name),
        source,
      }));
  } catch (error) {
    errors.push(
      createAppError(
        "filesystem_error",
        `${source} directory does not exist.`,
        `${rootWindowsPath}: ${toErrorMessage(error)}`,
        true,
      ),
    );
    return [];
  }
}

async function resolveActivePackageIds(
  modsConfigPath: string | null,
  toReadablePath: (windowsPath: string) => string | null,
  errors: AppError[],
) {
  if (!modsConfigPath) {
    errors.push(
      createAppError(
        "persistence_error",
        "No RimWorld config path is configured, so enabled state could not be resolved.",
        "Save or auto-detect the config directory to map active mods from ModsConfig.xml.",
        true,
      ),
    );
    return {
      activePackageIds: new Set<string>(),
      activePackageIdsOrdered: [],
    };
  }

  const readableModsConfigPath = toReadablePath(modsConfigPath);

  if (!readableModsConfigPath) {
    errors.push(
      createAppError(
        "environment_error",
        "Unable to map ModsConfig.xml into the current runtime.",
        modsConfigPath,
        true,
      ),
    );
    return {
      activePackageIds: new Set<string>(),
      activePackageIdsOrdered: [],
    };
  }

  try {
    return parseModsConfigXml(await readXmlFile(readableModsConfigPath));
  } catch (error) {
    errors.push(
      createAppError(
        "filesystem_error",
        "ModsConfig.xml was not found, so enabled state could not be resolved.",
        `${modsConfigPath}: ${toErrorMessage(error)}`,
        true,
      ),
    );
    return {
      activePackageIds: new Set<string>(),
      activePackageIdsOrdered: [],
    };
  }
}

export async function readActivePackageIdsFromSelection(
  selection: PathSelection | null,
  options: Pick<ScanModLibraryOptions, "toReadablePath"> = {},
) {
  const errors: AppError[] = [];
  const toReadablePath = options.toReadablePath ?? createReadablePathResolver();
  const modsConfigPath = selection?.configPath
    ? win32.join(selection.configPath, "ModsConfig.xml")
    : null;
  const parsed = await resolveActivePackageIds(
    modsConfigPath,
    toReadablePath,
    errors,
  );

  return parsed.activePackageIdsOrdered;
}

function buildWorkerSource() {
  return `
    import { join, win32 } from "node:path";

    ${decodeUtf16Le.toString()}
    ${decodeUtf16Be.toString()}
    ${decodeXmlFileContent.toString()}
    ${toErrorMessage.toString()}

    function isNodeErrorWithCode(error) {
      return error instanceof Error && "code" in error;
    }

    function isMissingFileError(error) {
      return isNodeErrorWithCode(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
    }

    async function readXmlFile(filePath) {
      return decodeXmlFileContent(await Bun.file(filePath).bytes());
    }

    async function scanTask(task) {
      const aboutReadablePath = join(task.modReadablePath, "About", "About.xml");
      const aboutWindowsPath = win32.join(task.modWindowsPath, "About", "About.xml");
      const readStart = performance.now();

      try {
        const aboutXmlText = await readXmlFile(aboutReadablePath);
        const readMs = performance.now() - readStart;

        return {
          entryName: task.entryName,
          hasAboutXml: true,
          manifestPath: aboutWindowsPath,
          aboutXmlText,
          modReadablePath: task.modReadablePath,
          modWindowsPath: task.modWindowsPath,
          notes: [],
          readMs,
          source: task.source,
        };
      } catch (error) {
        const readMs = performance.now() - readStart;

        if (isMissingFileError(error)) {
          return {
            entryName: task.entryName,
            hasAboutXml: false,
            manifestPath: null,
            aboutXmlText: null,
            modReadablePath: task.modReadablePath,
            modWindowsPath: task.modWindowsPath,
            notes: ["About/About.xml was not found."],
            readMs,
            source: task.source,
          };
        }

        return {
          entryName: task.entryName,
          hasAboutXml: true,
          manifestPath: aboutWindowsPath,
          aboutXmlText: null,
          modReadablePath: task.modReadablePath,
          modWindowsPath: task.modWindowsPath,
          notes: [\`About/About.xml could not be read: \${toErrorMessage(error)}\`],
          readMs,
          source: task.source,
        };
      }
    }

    self.onmessage = async (event) => {
      const request = event.data;

      try {
        const fragments = [];
        let readMs = 0;

        for (const task of request.tasks) {
          const fragment = await scanTask(task);
          readMs += fragment.readMs;
          delete fragment.readMs;
          fragments.push(fragment);
        }

        self.postMessage({
          chunkId: request.chunkId,
          error: null,
          fragments,
          metrics: {
            parseMs: 0,
            readMs,
          },
        });
      } catch (error) {
        self.postMessage({
          chunkId: request.chunkId,
          error: toErrorMessage(error),
          fragments: [],
          metrics: {
            parseMs: 0,
            readMs: 0,
          },
        });
      }
    };
  `;
}

async function runWorkerChunksWithPool(chunks: ScanTask[][], poolSize: number) {
  if (chunks.length === 0) {
    return {
      fragments: [],
      metrics: {
        parseMs: 0,
        readMs: 0,
        startupMs: 0,
      },
    };
  }

  const startupStart = performance.now();
  const workerUrl = URL.createObjectURL(
    new Blob([buildWorkerSource()], {
      type: "application/typescript",
    }),
  );
  const workerCount = Math.min(poolSize, chunks.length);
  const startupMs = performance.now() - startupStart;

  return new Promise<{
    fragments: ScannedModFragment[];
    metrics: WorkerScanMetrics;
  }>((resolve, reject) => {
    const results = new Array<ScannedModFragment[]>(chunks.length);
    let readMs = 0;
    let parseMs = 0;
    const workers = Array.from(
      { length: workerCount },
      () => new Worker(workerUrl),
    );
    let activeWorkers = workers.length;
    let completedChunks = 0;
    let nextChunkIndex = 0;
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(workerUrl);

      for (const worker of workers) {
        worker.terminate();
      }
    };

    const resolveIfDone = () => {
      if (completedChunks !== chunks.length || settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve({
        fragments: results.flat(),
        metrics: {
          parseMs,
          readMs,
          startupMs,
        },
      });
    };

    const fail = (message: string) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const assignNextChunk = (worker: Worker) => {
      if (settled) {
        return;
      }

      const chunkId = nextChunkIndex;
      const tasks = chunks[chunkId];

      if (!tasks) {
        activeWorkers -= 1;

        if (activeWorkers === 0) {
          resolveIfDone();
        }

        return;
      }

      nextChunkIndex += 1;
      const request: ScanChunkRequest = {
        chunkId,
        tasks,
      };
      worker.postMessage(request);
    };

    for (const worker of workers) {
      worker.onmessage = (event: MessageEvent<ScanChunkResponse>) => {
        const response = event.data;

        if (response.error) {
          fail(`Worker chunk ${response.chunkId} failed: ${response.error}`);
          return;
        }

        results[response.chunkId] = response.fragments;
        readMs += response.metrics.readMs;
        parseMs += response.metrics.parseMs;
        completedChunks += 1;
        assignNextChunk(worker);
        resolveIfDone();
      };

      worker.onerror = (event) => {
        fail(event.message || "Worker crashed during mod scan.");
      };

      assignNextChunk(worker);
    }
  });
}

async function scanModFragments(
  tasks: ScanTask[],
  environment: ExecutionEnvironment,
  errors: AppError[],
  runWorkerChunks: (
    chunks: ScanTask[][],
    poolSize: number,
  ) => Promise<{
    fragments: ScannedModFragment[];
    metrics: WorkerScanMetrics;
  }>,
) {
  if (tasks.length === 0) {
    return {
      fragments: [],
      metrics: {
        parseMs: 0,
        readMs: 0,
        startupMs: 0,
      },
    };
  }

  const chunks = chunkTasks(tasks);

  try {
    return await runWorkerChunks(chunks, getWorkerPoolSize(environment));
  } catch (error) {
    errors.push(
      createAppError(
        "unknown_error",
        "Parallel mod scan failed, so the desktop backend retried on the main thread.",
        toErrorMessage(error),
        true,
      ),
    );

    return {
      fragments: await scanModTasksInProcess(tasks),
      metrics: {
        parseMs: 0,
        readMs: 0,
        startupMs: 0,
      },
    };
  }
}

export async function readModSourceSnapshot(
  selection: PathSelection | null,
  options: ScanModLibraryOptions = {},
): Promise<ModSourceSnapshot> {
  const totalStart = performance.now();
  const environment = options.environment ?? getExecutionEnvironment();
  const toReadablePath = options.toReadablePath ?? createReadablePathResolver();
  const runWorkerChunks = options.runWorkerChunks ?? runWorkerChunksWithPool;
  const errors: AppError[] = [];
  const installationModsPath = selection?.installationPath
    ? win32.join(selection.installationPath, "Mods")
    : null;
  const installationDataPath = selection?.installationPath
    ? win32.join(selection.installationPath, "Data")
    : null;
  const workshopPath = selection?.workshopPath ?? null;
  const modsConfigPath = selection?.configPath
    ? win32.join(selection.configPath, "ModsConfig.xml")
    : null;

  if (!selection?.installationPath) {
    errors.push(
      createAppError(
        "persistence_error",
        "No RimWorld installation path is configured.",
        "Open Core Config and save a Windows installation path before loading the mod library.",
        true,
      ),
    );

    return {
      environment,
      selection,
      scannedAt: new Date().toISOString(),
      scannedRoots: {
        installationModsPath,
        workshopPath,
        modsConfigPath,
      },
      activePackageIds: [],
      entries: [],
      errors,
      requiresConfiguration: true,
    };
  }

  const configStart = performance.now();
  const activePackageIdsPromise =
    options.activePackageIdsOverride !== undefined
      ? Promise.resolve(
          createParsedActivePackageIds(options.activePackageIdsOverride),
        )
      : resolveActivePackageIds(modsConfigPath, toReadablePath, errors);
  const rootsStart = performance.now();
  const installationTasksPromise = listRootScanTasks(
    "installation",
    installationModsPath,
    toReadablePath,
    errors,
  );
  const installationDataTasksPromise = listRootScanTasks(
    "installation",
    installationDataPath,
    toReadablePath,
    errors,
    {
      requireAboutXml: true,
    },
  );
  const workshopTasksPromise = listRootScanTasks(
    "workshop",
    workshopPath,
    toReadablePath,
    errors,
  );
  const activeModsConfig = await activePackageIdsPromise;
  const activePackageIdsOrdered = activeModsConfig.activePackageIdsOrdered;
  const configMs = performance.now() - configStart;
  const [installationTasks, installationDataTasks, workshopTasks] =
    await Promise.all([
      installationTasksPromise,
      installationDataTasksPromise,
      workshopTasksPromise,
    ]);
  const rootEnumMs = performance.now() - rootsStart;
  const allTasks = [
    ...installationTasks,
    ...installationDataTasks,
    ...workshopTasks,
  ];
  const poolSize = allTasks.length > 0 ? getWorkerPoolSize(environment) : 0;

  const workerStart = performance.now();
  const { fragments, metrics } = await scanModFragments(
    allTasks,
    environment,
    errors,
    runWorkerChunks,
  );
  const workerMs = performance.now() - workerStart;
  const buildStart = performance.now();
  const entries = [...fragments].sort((left, right) =>
    left.entryName.localeCompare(right.entryName),
  );
  const buildResultMs = performance.now() - buildStart;
  const totalMs = performance.now() - totalStart;
  const notesCount = entries.reduce(
    (count, entry) => count + entry.notes.length,
    0,
  );

  logModScanProfile({
    errors,
    modsCount: entries.length,
    notesCount,
    poolSize,
    profile: {
      buildResultMs,
      configMs,
      rootEnumMs,
      totalMs,
      workerMs,
      workerOverheadMs: Math.max(
        0,
        workerMs - metrics.startupMs - metrics.readMs - metrics.parseMs,
      ),
      workerParseMs: metrics.parseMs,
      workerReadMs: metrics.readMs,
      workerStartupMs: metrics.startupMs,
    },
    taskCount: allTasks.length,
  });
  return {
    environment,
    selection,
    scannedAt: new Date().toISOString(),
    scannedRoots: {
      installationModsPath,
      workshopPath,
      modsConfigPath,
    },
    activePackageIds: activePackageIdsOrdered,
    entries,
    errors,
    requiresConfiguration: false,
  };
}

export async function scanModLibrary(
  selection: PathSelection | null,
  options: ScanModLibraryOptions = {},
): Promise<ModLibraryResult> {
  return buildModLibraryFromSnapshot(
    await readModSourceSnapshot(selection, options),
  );
}

export function writeActiveModsToConfig(
  selection: PathSelection | null,
  activePackageIds: string[],
  options: WriteActiveModsOptions = {},
) {
  const toReadablePath = options.toReadablePath ?? createReadablePathResolver();
  const modsConfigWindowsPath = selection?.configPath
    ? win32.join(selection.configPath, "ModsConfig.xml")
    : null;

  if (!modsConfigWindowsPath) {
    throw new Error("No RimWorld config path is configured.");
  }

  const readableModsConfigPath = toReadablePath(modsConfigWindowsPath);

  if (!readableModsConfigPath) {
    throw new Error("Unable to map ModsConfig.xml into the current runtime.");
  }

  if (!existsSync(readableModsConfigPath)) {
    throw new Error("ModsConfig.xml was not found.");
  }

  const { encoding, xml } = readXmlFileWithEncoding(readableModsConfigPath);
  const nextXml = replaceActiveModsBlock(xml, activePackageIds);
  writeFileSync(readableModsConfigPath, encodeXmlContent(nextXml, encoding));
}
