import {
  collectDefInjectedIdsFromXml,
  collectDefsBaselineIdsFromXml,
  collectKeyedIdsFromXml,
} from "./mod-localization/parser";

type WorkerFileRef = {
  absolutePath: string;
  relativePath: string;
};

export type WorkerBucketedLocalizationInventory = {
  defInjected: WorkerFileRef[];
  keyed: WorkerFileRef[];
  strings: WorkerFileRef[];
};

export type LocalizationWorkerParseTask = {
  baseline: WorkerBucketedLocalizationInventory;
  current: WorkerBucketedLocalizationInventory | null;
  taskId: string;
};

export type LocalizationWorkerParseResult = {
  baseline: {
    defInjected: string[];
    keyed: string[];
    strings: string[];
  };
  current:
    | {
        defInjected: string[];
        keyed: string[];
        strings: string[];
      }
    | null;
  taskId: string;
};

export type DefsWorkerParseTask = {
  files: string[];
  taskId: string;
};

export type DefsWorkerParseResult = {
  ids: string[];
  taskId: string;
};

export type LocalizationWorkerRequest =
  | {
      chunkId: number;
      kind: "parse-localization";
      tasks: LocalizationWorkerParseTask[];
    }
  | {
      chunkId: number;
      kind: "parse-defs";
      tasks: DefsWorkerParseTask[];
    };

export type LocalizationWorkerResponse =
  | {
      chunkId: number;
      error: null;
      kind: "parse-localization";
      results: LocalizationWorkerParseResult[];
    }
  | {
      chunkId: number;
      error: null;
      kind: "parse-defs";
      results: DefsWorkerParseResult[];
    }
  | {
      chunkId: number;
      error: string;
      kind: LocalizationWorkerRequest["kind"];
      results: [];
    };

function decodeUtf16Le(fileContent: Uint8Array) {
  return Buffer.from(fileContent).toString("utf16le");
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

function decodeXmlFileContent(fileContent: Uint8Array) {
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
    return new TextDecoder("utf-8").decode(fileContent.subarray(3));
  }

  return new TextDecoder("utf-8").decode(fileContent);
}

async function readDecodedXmlFile(filePath: string) {
  return decodeXmlFileContent(await Bun.file(filePath).bytes());
}

async function readUtf8TextFile(filePath: string) {
  return Bun.file(filePath).text();
}

function collectStringsIdsFromText(text: string, relativeFilePath: string) {
  const ids = new Set<string>();
  let lineIndex = 0;

  for (const line of text.split(/\r?\n/u)) {
    const normalizedLine = line.trim();

    if (!normalizedLine || normalizedLine.startsWith("#")) {
      continue;
    }

    ids.add(`strings:${relativeFilePath}:${lineIndex}`);
    lineIndex += 1;
  }

  return ids;
}

function normalizePathForId(value: string) {
  return value.replaceAll("\\", "/").toLowerCase();
}

async function parseLocalizationInventory(
  inventory: WorkerBucketedLocalizationInventory,
) {
  const keyed = new Set<string>();
  const defInjected = new Set<string>();
  const strings = new Set<string>();

  await Promise.all([
    ...inventory.keyed.map(async (file) => {
      try {
        const xml = await readDecodedXmlFile(file.absolutePath);
        collectKeyedIdsFromXml(xml, normalizePathForId(file.relativePath)).forEach(
          (id) => keyed.add(id),
        );
      } catch {
        // Ignore unrecoverable malformed files so one bad translation file
        // cannot take down the whole analysis.
      }
    }),
    ...inventory.defInjected.map(async (file) => {
      try {
        const xml = await readDecodedXmlFile(file.absolutePath);
        const defType = normalizePathForId(file.relativePath).split("/", 1)[0];

        if (!defType) {
          return;
        }

        collectDefInjectedIdsFromXml(xml, defType).forEach((id) =>
          defInjected.add(id),
        );
      } catch {
        // Ignore unrecoverable malformed files so one bad translation file
        // cannot take down the whole analysis.
      }
    }),
    ...inventory.strings.map(async (file) => {
      const text = await readUtf8TextFile(file.absolutePath);
      collectStringsIdsFromText(
        text,
        normalizePathForId(file.relativePath),
      ).forEach((id) => strings.add(id));
    }),
  ]);

  return {
    defInjected: [...defInjected],
    keyed: [...keyed],
    strings: [...strings],
  };
}

async function parseDefsFiles(files: string[]) {
  const ids = new Set<string>();

  await Promise.all(
    files.map(async (filePath) => {
      try {
        const xml = await readDecodedXmlFile(filePath);
        collectDefsBaselineIdsFromXml(xml).forEach((id) => ids.add(id));
      } catch {
        // Ignore unrecoverable malformed files so one bad defs file
        // cannot take down the whole analysis.
      }
    }),
  );

  return [...ids];
}

async function runLocalizationTasks(tasks: LocalizationWorkerParseTask[]) {
  // 并行处理所有任务
  const results = await Promise.all(
    tasks.map(async (task) => {
      const [baseline, current] = await Promise.all([
        parseLocalizationInventory(task.baseline),
        task.current === null
          ? Promise.resolve(null)
          : parseLocalizationInventory(task.current),
      ]);

      return {
        baseline,
        current,
        taskId: task.taskId,
      } satisfies LocalizationWorkerParseResult;
    })
  );

  return results;
}

async function runDefsTasks(tasks: DefsWorkerParseTask[]) {
  // 并行处理所有任务
  const results = await Promise.all(
    tasks.map(async (task) => ({
      ids: await parseDefsFiles(task.files),
      taskId: task.taskId,
    }))
  );

  return results;
}

const workerScope = globalThis as {
  onmessage:
    | ((
        event: MessageEvent<LocalizationWorkerRequest>,
      ) => void | Promise<void>)
    | null;
  postMessage: (message: LocalizationWorkerResponse) => void;
};

workerScope.onmessage = async (event: MessageEvent<LocalizationWorkerRequest>) => {
  const request = event.data;

  try {
    if (request.kind === "parse-localization") {
      workerScope.postMessage({
        chunkId: request.chunkId,
        error: null,
        kind: request.kind,
        results: await runLocalizationTasks(request.tasks),
      } satisfies LocalizationWorkerResponse);
      return;
    }

    workerScope.postMessage({
      chunkId: request.chunkId,
      error: null,
      kind: request.kind,
      results: await runDefsTasks(request.tasks),
    } satisfies LocalizationWorkerResponse);
  } catch (error) {
    workerScope.postMessage({
      chunkId: request.chunkId,
      error: error instanceof Error ? error.message : String(error),
      kind: request.kind,
      results: [],
    } satisfies LocalizationWorkerResponse);
  }
};
