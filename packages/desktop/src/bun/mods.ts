import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
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
  ModLocalizationSnapshot,
  ModSource,
  ModSourceSnapshot,
  ModSourceSnapshotEntry,
  PathSelection,
} from "@rimun/shared";
import {
  type ModLocalizationAnalysisProgress,
  readCurrentGameLanguage,
  readModLocalizationSnapshot,
} from "./mod-localization";
import { getExecutionEnvironment, windowsPathToWslPath } from "./platform";

export { parseAboutXml, parseModsConfigXml } from "@rimun/domain";

type ScanTask = {
  entryName: string;
  modReadablePath: string;
  modWindowsPath: string;
  source: ModSource;
};

type WorkerScanTask = ScanTask & {
  aboutCacheKey: string | null;
  aboutReadablePath: string;
  aboutWindowsPath: string;
};

type ScannedModFragment = ModSourceSnapshotEntry & {
  aboutCacheKey?: string | null;
  aboutReadablePath?: string | null;
  entryName: string;
};

type ScanChunkRequest = {
  chunkId: number;
  tasks: WorkerScanTask[];
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
  cacheMode: "cold-empty-skip" | "warm-lookup";
  cacheHitCount: number;
  cacheLookupMs: number;
  cacheMissCount: number;
  parseMs: number;
  readMs: number;
  startupMs: number;
};

type ScanModLibraryOptions = {
  activePackageIdsOverride?: string[];
  environment?: ExecutionEnvironment;
  runWorkerChunks?: (
    chunks: WorkerScanTask[][],
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
export const MAX_MOD_SCAN_WORKERS = 8;
const MAX_MOD_SCAN_CACHE_LOOKUP_CONCURRENCY = 16;
const DEFAULT_LOCALIZATION_STATUS = {
  kind: "missing" as const,
  isSupported: false,
  matchedFolderName: null,
  providerPackageIds: [] as string[],
  coverage: {
    completeness: "unknown" as const,
    coveredEntries: 0,
    totalEntries: null,
    percent: null,
  },
};

type ModScanProfile = {
  buildResultMs: number;
  cacheMode: "cold-empty-skip" | "warm-lookup";
  cacheHitCount: number;
  cacheLookupMs: number;
  cacheMissCount: number;
  configMs: number;
  workerOverheadMs: number;
  workerParseMs: number;
  workerReadMs: number;
  workerStartupMs: number;
  rootEnumMs: number;
  totalMs: number;
  workerMs: number;
};

type AboutXmlCacheEntry = {
  cacheKey: string;
  fragment: ScannedModFragment;
};

type CachedScanResolution = {
  cachedFragments: ScannedModFragment[];
  cacheMode: "cold-empty-skip" | "warm-lookup";
  metrics: Pick<
    WorkerScanMetrics,
    "cacheHitCount" | "cacheLookupMs" | "cacheMissCount"
  >;
  workerTasks: WorkerScanTask[];
};

type ModScanPerfStats = {
  aboutCacheHits: number;
  aboutCacheMisses: number;
  lastPoolSize: number;
  maxWorkerCount: number;
  workerInstancesCreated: number;
  workerSourceBuilds: number;
};

const aboutXmlCache = new Map<string, AboutXmlCacheEntry>();
const modScanPerfStats: ModScanPerfStats = {
  aboutCacheHits: 0,
  aboutCacheMisses: 0,
  lastPoolSize: 0,
  maxWorkerCount: 0,
  workerInstancesCreated: 0,
  workerSourceBuilds: 0,
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

function parseGameVersionText(versionText: string) {
  const firstLine = versionText
    .replace(/^\ufeff/, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? null;
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

async function readInstallationGameVersion(
  installationPath: string,
  toReadablePath: (windowsPath: string) => string | null,
) {
  const versionWindowsPath = win32.join(installationPath, "Version.txt");
  const versionReadablePath = toReadablePath(versionWindowsPath);

  if (!versionReadablePath) {
    return null;
  }

  try {
    const versionText = await Bun.file(versionReadablePath).text();
    const parsedVersion = parseGameVersionText(versionText);

    if (parsedVersion) {
      return parsedVersion;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function chunkTasks<TTask>(tasks: TTask[]) {
  const chunks: TTask[][] = [];

  for (let index = 0; index < tasks.length; index += SCAN_CHUNK_SIZE) {
    chunks.push(tasks.slice(index, index + SCAN_CHUNK_SIZE));
  }

  return chunks;
}

function cloneScannedModFragment(
  fragment: ScannedModFragment,
): ScannedModFragment {
  return {
    ...fragment,
    notes: [...fragment.notes],
  };
}

function createAboutXmlCacheKey(args: { mtimeMs: number; size: number }) {
  return `${args.mtimeMs}:${args.size}`;
}

function decodeXmlEntities(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function stripXmlControlCharacters(value: string, replacement: "" | " ") {
  let normalized = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isNullCharacter = codePoint === 0;
    const isBlockedControlCharacter =
      (codePoint >= 0x01 && codePoint <= 0x08) ||
      codePoint === 0x0b ||
      codePoint === 0x0c ||
      (codePoint >= 0x0e && codePoint <= 0x1f);

    if (isNullCharacter || isBlockedControlCharacter) {
      normalized += replacement;
      continue;
    }

    normalized += character;
  }

  return normalized;
}

function normalizeText(value: string) {
  return stripXmlControlCharacters(
    decodeXmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")),
    " ",
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultilineText(value: string) {
  return stripXmlControlCharacters(
    decodeXmlEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")),
    "",
  )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePackageId(value: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

function getRootInnerXml(xml: string, rootTagName: string) {
  const match = new RegExp(
    `<${rootTagName}\\b[^>]*>([\\s\\S]*?)</${rootTagName}>`,
    "i",
  ).exec(xml);

  return match?.[1] ?? xml;
}

function extractDirectChildTagBlocks(
  xml: string,
  tagName: string,
  rootTagName = "ModMetaData",
) {
  const rootInnerXml = getRootInnerXml(xml, rootTagName);
  const tagPattern =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([A-Za-z0-9:_-]+)\b[^>]*\/?>/g;
  const blocks: string[] = [];
  const stack: string[] = [];
  let captureStart: number | null = null;

  for (const match of rootInnerXml.matchAll(tagPattern)) {
    const fullTag = match[0] ?? "";
    const matchedTagName = match[1];

    if (!matchedTagName) {
      continue;
    }

    const normalizedTagName = matchedTagName.toLowerCase();
    const targetTagName = tagName.toLowerCase();
    const isClosingTag = fullTag.startsWith("</");
    const isSelfClosingTag = !isClosingTag && fullTag.endsWith("/>");

    if (!isClosingTag) {
      if (stack.length === 0 && normalizedTagName === targetTagName) {
        if (isSelfClosingTag) {
          blocks.push("");
          continue;
        }

        captureStart = (match.index ?? 0) + fullTag.length;
      }

      if (!isSelfClosingTag) {
        stack.push(normalizedTagName);
      }

      continue;
    }

    const closedTagName = stack.pop();

    if (
      closedTagName === targetTagName &&
      stack.length === 0 &&
      captureStart !== null
    ) {
      blocks.push(rootInnerXml.slice(captureStart, match.index ?? 0));
      captureStart = null;
    }
  }

  return blocks;
}

function extractDependencyPackageIds(xml: string) {
  const dependencyXml = extractDirectChildTagBlocks(xml, "modDependencies").at(
    0,
  );

  if (!dependencyXml) {
    return [];
  }

  return [...dependencyXml.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((entry) => {
      const dependencyItemXml = entry[1] ?? "";
      const nestedPackageId = extractAboutTagText(dependencyItemXml, "packageId");

      return normalizePackageId(
        nestedPackageId ?? normalizeText(dependencyItemXml),
      );
    })
    .filter((value): value is string => Boolean(value));
}

function extractAboutTagText(xml: string, tagName: string) {
  const block = extractDirectChildTagBlocks(xml, tagName).at(0);
  return block ? normalizeText(block) || null : null;
}

function extractAboutTagMultilineText(xml: string, tagName: string) {
  const block = extractDirectChildTagBlocks(xml, tagName).at(0);
  return block ? normalizeMultilineText(block) || null : null;
}

function extractAboutTagList(xml: string, tagName: string) {
  const block = extractDirectChildTagBlocks(xml, tagName).at(0);

  if (!block) {
    return [];
  }

  return [...block.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
    .map((entry) => normalizeText(entry[1] ?? ""))
    .filter(Boolean);
}

function mergeSupportedVersions(
  targetVersion: string | null,
  listedSupportedVersions: string[],
) {
  const mergedVersions: string[] = [];
  const seen = new Set<string>();

  const pushVersion = (value: string | null) => {
    if (!value || seen.has(value)) {
      return;
    }

    seen.add(value);
    mergedVersions.push(value);
  };

  pushVersion(targetVersion);

  for (const version of listedSupportedVersions) {
    pushVersion(version);
  }

  return mergedVersions;
}

function parseAboutXmlMetadata(xml: string) {
  const authors = extractAboutTagList(xml, "authors");
  const authorText = extractAboutTagText(xml, "author");
  const targetVersion = extractAboutTagText(xml, "targetVersion");
  const supportedVersions = mergeSupportedVersions(
    targetVersion,
    extractAboutTagList(xml, "supportedVersions"),
  );
  const packageId = extractAboutTagText(xml, "packageId");

  return {
    name: extractAboutTagText(xml, "name"),
    packageId,
    author:
      authors.length > 0
        ? authors.join(", ")
        : authorText
          ? normalizeText(authorText)
          : null,
    version: extractAboutTagText(xml, "modVersion") ?? null,
    description: extractAboutTagMultilineText(xml, "description"),
    dependencyMetadata: {
      packageIdNormalized: normalizePackageId(packageId),
      dependencies: extractDependencyPackageIds(xml),
      loadAfter: extractAboutTagList(xml, "loadAfter").map((value) =>
        value.toLowerCase(),
      ),
      loadBefore: extractAboutTagList(xml, "loadBefore").map((value) =>
        value.toLowerCase(),
      ),
      forceLoadAfter: extractAboutTagList(xml, "forceLoadAfter").map((value) =>
        value.toLowerCase(),
      ),
      forceLoadBefore: extractAboutTagList(xml, "forceLoadBefore").map(
        (value) => value.toLowerCase(),
      ),
      incompatibleWith: extractAboutTagList(xml, "incompatibleWith").map(
        (value) => value.toLowerCase(),
      ),
      supportedVersions,
    },
  };
}

function createEmptyDependencyMetadata() {
  return {
    packageIdNormalized: null,
    dependencies: [] as string[],
    loadAfter: [] as string[],
    loadBefore: [] as string[],
    forceLoadAfter: [] as string[],
    forceLoadBefore: [] as string[],
    incompatibleWith: [] as string[],
    supportedVersions: [] as string[],
  };
}

function createManifestMetadataFromAboutXml(args: {
  aboutXmlText: string | null | undefined;
  entryName: string;
}) {
  const parsedAbout = args.aboutXmlText
    ? parseAboutXmlMetadata(args.aboutXmlText)
    : null;

  return {
    name: parsedAbout?.name ?? args.entryName,
    packageId: parsedAbout?.packageId ?? null,
    author: parsedAbout?.author ?? null,
    version: parsedAbout?.version ?? null,
    description: parsedAbout?.description ?? null,
    dependencyMetadata:
      parsedAbout?.dependencyMetadata ?? createEmptyDependencyMetadata(),
  };
}

function createMissingAboutFragment(task: WorkerScanTask): ScannedModFragment {
  return {
    aboutCacheKey: task.aboutCacheKey,
    aboutReadablePath: task.aboutReadablePath,
    entryName: task.entryName,
    hasAboutXml: false,
    manifestPath: null,
    aboutXmlText: null,
    localizationStatus: DEFAULT_LOCALIZATION_STATUS,
    manifestMetadata: createManifestMetadataFromAboutXml({
      aboutXmlText: null,
      entryName: task.entryName,
    }),
    modReadablePath: task.modReadablePath,
    modWindowsPath: task.modWindowsPath,
    notes: ["About/About.xml was not found."],
    source: task.source,
  } satisfies ScannedModFragment;
}

function getWorkerPoolSize(environment: ExecutionEnvironment) {
  const _environment = environment;
  void _environment;

  return Math.max(
    2,
    Math.min(MAX_MOD_SCAN_WORKERS, Math.ceil(availableParallelism() * 0.6)),
  );
}

function getAboutXmlCacheLookupConcurrency(environment: ExecutionEnvironment) {
  const _environment = environment;
  void _environment;

  return Math.max(
    2,
    Math.min(MAX_MOD_SCAN_CACHE_LOOKUP_CONCURRENCY, availableParallelism() * 2),
  );
}

async function mapWithConcurrencyLimit<TItem, TResult>(
  items: TItem[],
  limit: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
) {
  if (items.length === 0) {
    return [] as TResult[];
  }

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const item = items[currentIndex];

        if (item === undefined) {
          return;
        }

        results[currentIndex] = await mapper(item, currentIndex);
      }
    }),
  );

  return results;
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
    `[mod-scan-cache] mode=${profile.cacheMode} lookup=${formatDurationMs(profile.cacheLookupMs)} hits=${profile.cacheHitCount} misses=${profile.cacheMissCount}`,
  );
  console.log(
    `[mod-scan-worker] startup=${formatDurationMs(profile.workerStartupMs)} read=${formatDurationMs(profile.workerReadMs)} parse=${formatDurationMs(profile.workerParseMs)} overhead=${formatDurationMs(profile.workerOverheadMs)}`,
  );
}

async function scanModTask(task: ScanTask | WorkerScanTask) {
  const aboutReadablePath =
    "aboutReadablePath" in task
      ? task.aboutReadablePath
      : join(task.modReadablePath, "About", "About.xml");
  const aboutWindowsPath =
    "aboutWindowsPath" in task
      ? task.aboutWindowsPath
      : win32.join(task.modWindowsPath, "About", "About.xml");
  const aboutFile = Bun.file(aboutReadablePath);

  try {
    const aboutXmlText = decodeXmlFileContent(await aboutFile.bytes());
    const aboutCacheKey =
      "aboutCacheKey" in task && task.aboutCacheKey
        ? task.aboutCacheKey
        : createAboutXmlCacheKey({
            mtimeMs: aboutFile.lastModified,
            size: aboutFile.size,
          });

    return {
      aboutCacheKey,
      aboutReadablePath,
      entryName: task.entryName,
      hasAboutXml: true,
      manifestMetadata: createManifestMetadataFromAboutXml({
        aboutXmlText,
        entryName: task.entryName,
      }),
      manifestPath: aboutWindowsPath,
      aboutXmlText,
      localizationStatus: DEFAULT_LOCALIZATION_STATUS,
      modReadablePath: task.modReadablePath,
      modWindowsPath: task.modWindowsPath,
      notes: [],
      source: task.source,
    } satisfies ScannedModFragment;
  } catch (error) {
    const aboutCacheKey = "aboutCacheKey" in task ? task.aboutCacheKey : null;

    if (isMissingFileError(error)) {
      return {
        aboutCacheKey: aboutCacheKey ?? "missing",
        aboutReadablePath,
        entryName: task.entryName,
        hasAboutXml: false,
        manifestMetadata: createManifestMetadataFromAboutXml({
          aboutXmlText: null,
          entryName: task.entryName,
        }),
        manifestPath: null,
        aboutXmlText: null,
        localizationStatus: DEFAULT_LOCALIZATION_STATUS,
        modReadablePath: task.modReadablePath,
        modWindowsPath: task.modWindowsPath,
        notes: ["About/About.xml was not found."],
        source: task.source,
      } satisfies ScannedModFragment;
    }

    return {
      aboutCacheKey,
      aboutReadablePath,
      entryName: task.entryName,
      hasAboutXml: true,
      manifestMetadata: createManifestMetadataFromAboutXml({
        aboutXmlText: null,
        entryName: task.entryName,
      }),
      manifestPath: aboutWindowsPath,
      aboutXmlText: null,
      localizationStatus: DEFAULT_LOCALIZATION_STATUS,
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

async function resolveCachedScanFragments(
  tasks: ScanTask[],
  environment: ExecutionEnvironment,
): Promise<CachedScanResolution> {
  if (aboutXmlCache.size === 0) {
    modScanPerfStats.aboutCacheMisses += tasks.length;

    return {
      cachedFragments: [],
      cacheMode: "cold-empty-skip",
      metrics: {
        cacheHitCount: 0,
        cacheLookupMs: 0,
        cacheMissCount: tasks.length,
      },
      workerTasks: tasks.map((task) => ({
        ...task,
        aboutCacheKey: null,
        aboutReadablePath: join(task.modReadablePath, "About", "About.xml"),
        aboutWindowsPath: win32.join(task.modWindowsPath, "About", "About.xml"),
      })),
    };
  }

  const lookupStart = performance.now();
  const lookupConcurrency = Math.min(
    getAboutXmlCacheLookupConcurrency(environment),
    tasks.length,
  );
  const cachedFragments: ScannedModFragment[] = [];
  const workerTasks: WorkerScanTask[] = [];
  let cacheHitCount = 0;
  let cacheMissCount = 0;

  const results = await mapWithConcurrencyLimit(
    tasks,
    Math.max(1, lookupConcurrency),
    async (task) => {
      const aboutReadablePath = join(
        task.modReadablePath,
        "About",
        "About.xml",
      );
      const aboutWindowsPath = win32.join(
        task.modWindowsPath,
        "About",
        "About.xml",
      );

      try {
        const aboutStats = await stat(aboutReadablePath);
        const cacheKey = createAboutXmlCacheKey({
          mtimeMs: aboutStats.mtimeMs,
          size: aboutStats.size,
        });
        const cached = aboutXmlCache.get(aboutReadablePath);

        if (cached?.cacheKey === cacheKey) {
          return {
            cacheHit: true,
            fragment: cloneScannedModFragment(cached.fragment),
            workerTask: null,
          } as const;
        }

        return {
          cacheHit: false,
          fragment: null,
          workerTask: {
            ...task,
            aboutCacheKey: cacheKey,
            aboutReadablePath,
            aboutWindowsPath,
          } satisfies WorkerScanTask,
        } as const;
      } catch (error) {
        if (isMissingFileError(error)) {
          const cacheKey = "missing";
          const cached = aboutXmlCache.get(aboutReadablePath);

          if (cached?.cacheKey === cacheKey) {
            return {
              cacheHit: true,
              fragment: cloneScannedModFragment(cached.fragment),
              workerTask: null,
            } as const;
          }

          const fragment = createMissingAboutFragment({
            ...task,
            aboutCacheKey: cacheKey,
            aboutReadablePath,
            aboutWindowsPath,
          });

          aboutXmlCache.set(aboutReadablePath, {
            cacheKey,
            fragment: cloneScannedModFragment(fragment),
          });

          return {
            cacheHit: false,
            fragment,
            workerTask: null,
          } as const;
        }

        return {
          cacheHit: false,
          fragment: null,
          workerTask: {
            ...task,
            aboutCacheKey: null,
            aboutReadablePath,
            aboutWindowsPath,
          } satisfies WorkerScanTask,
        } as const;
      }
    },
  );

  for (const result of results) {
    if (result.cacheHit) {
      cacheHitCount += 1;
    } else {
      cacheMissCount += 1;
    }

    if (result.fragment) {
      cachedFragments.push(result.fragment);
    }

    if (result.workerTask) {
      workerTasks.push(result.workerTask);
    }
  }

  modScanPerfStats.aboutCacheHits += cacheHitCount;
  modScanPerfStats.aboutCacheMisses += cacheMissCount;

  return {
    cachedFragments,
    cacheMode: "warm-lookup",
    metrics: {
      cacheHitCount,
      cacheLookupMs: performance.now() - lookupStart,
      cacheMissCount,
    },
    workerTasks,
  };
}

function updateAboutXmlCache(fragments: ScannedModFragment[]) {
  for (const fragment of fragments) {
    if (
      !fragment.aboutReadablePath ||
      !fragment.aboutCacheKey ||
      (fragment.aboutXmlText === null && fragment.aboutCacheKey !== "missing")
    ) {
      continue;
    }

    aboutXmlCache.set(fragment.aboutReadablePath, {
      cacheKey: fragment.aboutCacheKey,
      fragment: cloneScannedModFragment(fragment),
    });
  }
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
    ${createAboutXmlCacheKey.toString()}
    ${decodeXmlEntities.toString()}
    ${stripXmlControlCharacters.toString()}
    ${normalizeText.toString()}
    ${normalizeMultilineText.toString()}
    ${normalizePackageId.toString()}
    ${getRootInnerXml.toString()}
    ${extractDirectChildTagBlocks.toString()}
    ${extractDependencyPackageIds.toString()}
    ${extractAboutTagText.toString()}
    ${extractAboutTagMultilineText.toString()}
    ${extractAboutTagList.toString()}
    ${mergeSupportedVersions.toString()}
    ${parseAboutXmlMetadata.toString()}
    ${createEmptyDependencyMetadata.toString()}
    ${toErrorMessage.toString()}

    function isNodeErrorWithCode(error) {
      return error instanceof Error && "code" in error;
    }

    function isMissingFileError(error) {
      return isNodeErrorWithCode(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
    }

    const DEFAULT_LOCALIZATION_STATUS = ${JSON.stringify(DEFAULT_LOCALIZATION_STATUS)};

    ${createManifestMetadataFromAboutXml.toString()}

    async function readXmlFile(filePath) {
      return decodeXmlFileContent(await Bun.file(filePath).bytes());
    }

    async function scanTask(task) {
      const aboutReadablePath = task.aboutReadablePath ?? join(task.modReadablePath, "About", "About.xml");
      const aboutWindowsPath = task.aboutWindowsPath ?? win32.join(task.modWindowsPath, "About", "About.xml");
      const aboutFile = Bun.file(aboutReadablePath);
      const readStart = performance.now();

      try {
        const aboutXmlText = decodeXmlFileContent(await aboutFile.bytes());
        const readMs = performance.now() - readStart;
        const parseStart = performance.now();
        const manifestMetadata = createManifestMetadataFromAboutXml({
          aboutXmlText,
          entryName: task.entryName,
        });
        const parseMs = performance.now() - parseStart;

        return {
          aboutCacheKey: task.aboutCacheKey ?? createAboutXmlCacheKey({
            mtimeMs: aboutFile.lastModified,
            size: aboutFile.size,
          }),
          aboutReadablePath,
          entryName: task.entryName,
          hasAboutXml: true,
          manifestMetadata,
          manifestPath: aboutWindowsPath,
          aboutXmlText,
          localizationStatus: DEFAULT_LOCALIZATION_STATUS,
          modReadablePath: task.modReadablePath,
          modWindowsPath: task.modWindowsPath,
          notes: [],
          parseMs,
          readMs,
          source: task.source,
        };
      } catch (error) {
        const readMs = performance.now() - readStart;
        const parseStart = performance.now();
        const manifestMetadata = createManifestMetadataFromAboutXml({
          aboutXmlText: null,
          entryName: task.entryName,
        });
        const parseMs = performance.now() - parseStart;

        if (isMissingFileError(error)) {
          return {
            aboutCacheKey: task.aboutCacheKey ?? "missing",
            aboutReadablePath,
            entryName: task.entryName,
            hasAboutXml: false,
            manifestMetadata,
            manifestPath: null,
            aboutXmlText: null,
            localizationStatus: DEFAULT_LOCALIZATION_STATUS,
            modReadablePath: task.modReadablePath,
            modWindowsPath: task.modWindowsPath,
            notes: ["About/About.xml was not found."],
            parseMs,
            readMs,
            source: task.source,
          };
        }

        return {
          aboutCacheKey: task.aboutCacheKey ?? null,
          aboutReadablePath,
          entryName: task.entryName,
          hasAboutXml: true,
          manifestMetadata,
          manifestPath: aboutWindowsPath,
          aboutXmlText: null,
          localizationStatus: DEFAULT_LOCALIZATION_STATUS,
          modReadablePath: task.modReadablePath,
          modWindowsPath: task.modWindowsPath,
          notes: [\`About/About.xml could not be read: \${toErrorMessage(error)}\`],
          parseMs,
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
        let parseMs = 0;

        for (const task of request.tasks) {
          const fragment = await scanTask(task);
          parseMs += fragment.parseMs;
          readMs += fragment.readMs;
          delete fragment.parseMs;
          delete fragment.readMs;
          fragments.push(fragment);
        }

        self.postMessage({
          chunkId: request.chunkId,
          error: null,
          fragments,
          metrics: {
            parseMs,
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

class ReusableModScanWorkerPool {
  private queuedRun: Promise<void> = Promise.resolve();
  private workerSourceUrl: string | null = null;
  private workers: Worker[] = [];

  reset() {
    for (const worker of this.workers) {
      worker.terminate();
    }

    this.workers = [];

    if (this.workerSourceUrl) {
      URL.revokeObjectURL(this.workerSourceUrl);
      this.workerSourceUrl = null;
    }
  }

  async runChunks(chunks: WorkerScanTask[][], poolSize: number) {
    const execute = async () => this.runChunksNow(chunks, poolSize);
    const result = this.queuedRun.then(execute, execute);

    this.queuedRun = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private ensureWorkerSourceUrl() {
    if (this.workerSourceUrl) {
      return this.workerSourceUrl;
    }

    this.workerSourceUrl = URL.createObjectURL(
      new Blob([buildWorkerSource()], {
        type: "application/typescript",
      }),
    );
    modScanPerfStats.workerSourceBuilds += 1;
    return this.workerSourceUrl;
  }

  private ensureWorkers(workerCount: number) {
    const workerSourceUrl = this.ensureWorkerSourceUrl();

    while (this.workers.length < workerCount) {
      this.workers.push(new Worker(workerSourceUrl));
      modScanPerfStats.workerInstancesCreated += 1;
      modScanPerfStats.maxWorkerCount = Math.max(
        modScanPerfStats.maxWorkerCount,
        this.workers.length,
      );
    }

    return this.workers.slice(0, workerCount);
  }

  private async runChunksNow(chunks: WorkerScanTask[][], poolSize: number) {
    if (chunks.length === 0) {
      modScanPerfStats.lastPoolSize = 0;

      return {
        fragments: [],
        metrics: {
          cacheMode: "warm-lookup" as const,
          cacheHitCount: 0,
          cacheLookupMs: 0,
          cacheMissCount: 0,
          parseMs: 0,
          readMs: 0,
          startupMs: 0,
        },
      };
    }

    const startupStart = performance.now();
    const workerCount = Math.min(poolSize, chunks.length);
    const workers = this.ensureWorkers(workerCount);
    const startupMs = performance.now() - startupStart;
    modScanPerfStats.lastPoolSize = workerCount;

    return new Promise<{
      fragments: ScannedModFragment[];
      metrics: WorkerScanMetrics;
    }>((resolve, reject) => {
      const results = new Array<ScannedModFragment[]>(chunks.length);
      let readMs = 0;
      let parseMs = 0;
      let completedChunks = 0;
      let idleWorkers = 0;
      let nextChunkIndex = 0;
      let settled = false;

      const clearHandlers = () => {
        for (const worker of workers) {
          worker.onmessage = null;
          worker.onerror = null;
        }
      };

      const resolveIfDone = () => {
        if (
          settled ||
          completedChunks !== chunks.length ||
          idleWorkers !== workers.length
        ) {
          return;
        }

        settled = true;
        clearHandlers();
        resolve({
          fragments: results.flat(),
          metrics: {
            cacheMode: "warm-lookup" as const,
            cacheHitCount: 0,
            cacheLookupMs: 0,
            cacheMissCount: 0,
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
        clearHandlers();
        this.reset();
        reject(new Error(message));
      };

      const assignNextChunk = (worker: Worker) => {
        if (settled) {
          return;
        }

        const chunkId = nextChunkIndex;
        const tasks = chunks[chunkId];

        if (!tasks) {
          idleWorkers += 1;
          resolveIfDone();
          return;
        }

        nextChunkIndex += 1;
        worker.postMessage({
          chunkId,
          tasks,
        } satisfies ScanChunkRequest);
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
}

const reusableModScanWorkerPool = new ReusableModScanWorkerPool();

export function getModScanPerfStatsForTests() {
  return {
    ...modScanPerfStats,
  };
}

export function resetModScanPerfStateForTests() {
  aboutXmlCache.clear();
  reusableModScanWorkerPool.reset();
  modScanPerfStats.aboutCacheHits = 0;
  modScanPerfStats.aboutCacheMisses = 0;
  modScanPerfStats.lastPoolSize = 0;
  modScanPerfStats.maxWorkerCount = 0;
  modScanPerfStats.workerInstancesCreated = 0;
  modScanPerfStats.workerSourceBuilds = 0;
}

async function runWorkerChunksWithPool(
  chunks: WorkerScanTask[][],
  poolSize: number,
) {
  if (chunks.length === 0) {
    modScanPerfStats.lastPoolSize = 0;

    return {
      fragments: [],
      metrics: {
        cacheMode: "warm-lookup" as const,
        cacheHitCount: 0,
        cacheLookupMs: 0,
        cacheMissCount: 0,
        parseMs: 0,
        readMs: 0,
        startupMs: 0,
      },
    };
  }

  return reusableModScanWorkerPool.runChunks(chunks, poolSize);
}

async function scanModFragments(
  tasks: ScanTask[],
  environment: ExecutionEnvironment,
  errors: AppError[],
  runWorkerChunks: (
    chunks: WorkerScanTask[][],
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
        cacheMode: "warm-lookup" as const,
        cacheHitCount: 0,
        cacheLookupMs: 0,
        cacheMissCount: 0,
        parseMs: 0,
        readMs: 0,
        startupMs: 0,
      },
    };
  }

  const {
    cachedFragments,
    cacheMode,
    metrics: cacheMetrics,
    workerTasks,
  } = await resolveCachedScanFragments(tasks, environment);
  const chunks = chunkTasks(workerTasks);

  try {
    const { fragments: workerFragments, metrics } = await runWorkerChunks(
      chunks,
      getWorkerPoolSize(environment),
    );
    const { cacheMode: _workerCacheMode, ...workerMetrics } = metrics;

    updateAboutXmlCache(workerFragments);

    return {
      fragments: [...cachedFragments, ...workerFragments],
      metrics: {
        ...workerMetrics,
        cacheMode,
        cacheHitCount: cacheMetrics.cacheHitCount,
        cacheLookupMs: cacheMetrics.cacheLookupMs,
        cacheMissCount: cacheMetrics.cacheMissCount,
      },
    };
  } catch (error) {
    errors.push(
      createAppError(
        "unknown_error",
        "Parallel mod scan failed, so the desktop backend retried on the main thread.",
        toErrorMessage(error),
        true,
      ),
    );

    const workerFragments = await scanModTasksInProcess(workerTasks);
    updateAboutXmlCache(workerFragments);

    return {
      fragments: [...cachedFragments, ...workerFragments],
      metrics: {
        cacheMode,
        cacheHitCount: cacheMetrics.cacheHitCount,
        cacheLookupMs: cacheMetrics.cacheLookupMs,
        cacheMissCount: cacheMetrics.cacheMissCount,
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
      gameVersion: null,
      currentGameLanguage: {
        folderName: null,
        normalizedFolderName: null,
        source: "unknown",
      },
      activePackageIds: [],
      entries: [],
      errors,
      requiresConfiguration: true,
    };
  }

  const configStart = performance.now();
  const gameVersionPromise = readInstallationGameVersion(
    selection.installationPath,
    toReadablePath,
  );
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
  const [gameVersion, installationTasks, installationDataTasks, workshopTasks] =
    await Promise.all([
      gameVersionPromise,
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
  const currentGameLanguage = await readCurrentGameLanguage({
    configPath: selection.configPath,
    toReadablePath,
  });
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
      cacheMode: metrics.cacheMode,
      cacheHitCount: metrics.cacheHitCount,
      cacheLookupMs: metrics.cacheLookupMs,
      cacheMissCount: metrics.cacheMissCount,
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
    gameVersion,
    currentGameLanguage,
    activePackageIds: activePackageIdsOrdered,
    entries,
    errors,
    requiresConfiguration: false,
  };
}

export async function readModLocalizationSnapshotForSnapshot(
  snapshot: ModSourceSnapshot,
  options: {
    onProgress?: (progress: ModLocalizationAnalysisProgress) => void;
    toReadablePath?: (windowsPath: string) => string | null;
    watchChanges?: boolean;
  } = {},
): Promise<ModLocalizationSnapshot> {
  if (snapshot.requiresConfiguration || snapshot.entries.length === 0) {
    return {
      currentGameLanguage: snapshot.currentGameLanguage,
      entries: [],
      scannedAt: snapshot.scannedAt,
    };
  }

  const toReadablePath = options.toReadablePath ?? createReadablePathResolver();

  return readModLocalizationSnapshot({
    activePackageIds: snapshot.activePackageIds,
    configPath: snapshot.selection?.configPath ?? null,
    currentGameLanguage: snapshot.currentGameLanguage,
    entries: snapshot.entries,
    gameVersion: snapshot.gameVersion,
    onProgress: options.onProgress,
    scannedAt: snapshot.scannedAt,
    toReadablePath,
    watchChanges: options.watchChanges,
  });
}

export async function scanModLibrary(
  selection: PathSelection | null,
  options: ScanModLibraryOptions = {},
): Promise<ModLibraryResult> {
  const snapshot = await readModSourceSnapshot(selection, options);
  const localizationSnapshot = await readModLocalizationSnapshotForSnapshot(
    snapshot,
    options,
  );
  const localizationStatusByWindowsPath = new Map(
    localizationSnapshot.entries.map((entry) => [
      entry.modWindowsPath,
      entry.localizationStatus,
    ]),
  );

  return buildModLibraryFromSnapshot({
    ...snapshot,
    currentGameLanguage: localizationSnapshot.currentGameLanguage,
    entries: snapshot.entries.map((entry) => ({
      ...entry,
      localizationStatus:
        localizationStatusByWindowsPath.get(entry.modWindowsPath) ??
        entry.localizationStatus,
    })),
  });
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
