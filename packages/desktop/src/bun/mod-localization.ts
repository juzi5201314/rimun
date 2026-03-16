import { readdir, stat } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, relative, win32 } from "node:path";
import { parseAboutXml } from "@rimun/domain";
import type {
  CurrentGameLanguage,
  ModLocalizationSnapshot,
  ModLocalizationStatus,
  ModSourceSnapshotEntry,
} from "@rimun/shared";
import pLimit from "p-limit";
import {
  cloneTranslationEntryVectors,
  createEmptyTranslationEntryVectors,
  type TranslationBucket,
  type TranslationEntryVectors,
  internTranslationEntrySets,
  internTranslationIdsForBucket,
  loadCachedDefsBaseline,
  loadCachedDescriptorArtifacts,
  resetLocalizationIndexStateForTests,
  saveCachedDefsBaseline,
  saveCachedDescriptorArtifacts,
} from "./mod-localization-index";
import {
  collectDefInjectedIdsFromXml,
  collectDefsBaselineIdsFromXml,
  collectKeyedIdsFromXml,
  extractFirstMatchingTagText,
  getXmlRecoveryStatsForTests,
  resetXmlRecoveryStatsForTests,
} from "./mod-localization/parser";
import type {
  DefsWorkerParseResult,
  DefsWorkerParseTask,
  LocalizationWorkerParseResult,
  LocalizationWorkerParseTask,
  LocalizationWorkerRequest,
  LocalizationWorkerResponse,
  WorkerBucketedLocalizationInventory,
} from "./mod-localization.worker";

type TranslationEntrySets = TranslationEntryVectors;

type LanguageContribution = {
  hasAnyLanguagesRoot: boolean;
  matchedFolderName: string | null;
  entries: TranslationEntrySets;
};

type ModLocalizationDescriptor = {
  baselineEntries: TranslationEntrySets;
  currentLanguageContribution: LanguageContribution;
  descriptorFingerprint: string;
  dependencyTargets: Set<string>;
  entry: ModSourceSnapshotEntry;
  hasSelfTranslation: boolean;
  packageIdNormalized: string | null;
  relativeRoots: string[];
};

type FileInventoryEntry = {
  absolutePath: string;
  fingerprintToken: string;
  relativePath: string;
  size: number;
};

type MutableBucketedFileInventory = {
  defInjected: FileInventoryEntry[];
  keyed: FileInventoryEntry[];
  strings: FileInventoryEntry[];
  tokens: string[];
};

type BucketedFileInventory = {
  defInjected: FileInventoryEntry[];
  fingerprint: string;
  keyed: FileInventoryEntry[];
  strings: FileInventoryEntry[];
};

type LanguageContributionInventory = {
  current: BucketedFileInventory;
  english: BucketedFileInventory;
  fingerprint: string;
  hasAnyLanguagesRoot: boolean;
  matchedFolderName: string | null;
};

type CachedDefsBaseline = {
  fingerprint: string;
  ids: number[];
};

type AnalysisRuntime = {
  descriptorConcurrency: number;
  descriptorLimit: ReturnType<typeof pLimit>;
  fileConcurrency: number;
  fileLimit: ReturnType<typeof pLimit>;
  workerPoolSize: number;
};

type ProviderIndex = {
  byDependencyTarget: Map<string, number[]>;
  byTranslationIdBitmap: Record<TranslationBucket, Map<number, Uint32Array>>;
  byTranslationIdOrdered: Record<TranslationBucket, Map<number, number[]>>;
  providerOrdinalsByPackageId: Map<string, number>;
  providerWordCount: number;
  providersByOrdinal: ModLocalizationDescriptor[];
};

type PreparedDescriptorMiss = {
  cacheKey: string;
  entry: ModSourceSnapshotEntry;
  index: number;
  languageInventory: LanguageContributionInventory;
  metadata: ReturnType<typeof collectDependencyTargets>;
  relativeRoots: string[];
};

type DescriptorCacheMiss = Omit<PreparedDescriptorMiss, "index">;

type PreparedDescriptorResolution =
  | {
      kind: "hit";
      descriptor: ModLocalizationDescriptor;
    }
  | ({
      kind: "miss";
    } & DescriptorCacheMiss);

type PreparedDefsBaselineMiss = {
  cacheKey: string;
  descriptor: ModLocalizationDescriptor;
  fingerprint: string;
  indexGroups: number[][];
  inventoryFiles: FileInventoryEntry[];
  modReadablePath: string;
};

export type ModLocalizationAnalysisProgress = {
  completedUnits: number;
  percent: number;
  totalUnits: number;
};

export type ModLocalizationPerfStats = {
  defsDbHits: number;
  defsDbMisses: number;
  defsCacheHits: number;
  defsCacheMisses: number;
  descriptorDbHits: number;
  descriptorDbMisses: number;
  descriptorBuildMs: number;
  descriptorCacheHits: number;
  descriptorCacheMisses: number;
  descriptorConcurrency: number;
  fileConcurrency: number;
  finalStatusBuildMs: number;
  initialStatusBuildMs: number;
  lastAnalyzeMs: number;
  providerBitmapBuildMs: number;
  recoveredFiles: number;
  statusComputeMs: number;
  strictParseFailures: number;
  unrecoverableFiles: number;
};

const TRANSLATION_BUCKETS: TranslationBucket[] = [
  "keyed",
  "defInjected",
  "strings",
];

const LOCALIZATION_STATUS_MISSING: ModLocalizationStatus = {
  kind: "missing",
  isSupported: false,
  matchedFolderName: null,
  providerPackageIds: [],
  coverage: {
    completeness: "unknown",
    coveredEntries: 0,
    totalEntries: null,
    percent: null,
  },
};

const LOCALIZATION_STATUS_MISSING_LANGUAGE: ModLocalizationStatus = {
  kind: "missing_language",
  isSupported: false,
  matchedFolderName: null,
  providerPackageIds: [],
  coverage: {
    completeness: "unknown",
    coveredEntries: 0,
    totalEntries: null,
    percent: null,
  },
};

const MAX_LOCALIZATION_DESCRIPTOR_CONCURRENCY = 8;
const MAX_LOCALIZATION_FILE_CONCURRENCY = 32;
const MAX_LOCALIZATION_WORKERS = 8;
const LOCALIZATION_WORKER_CHUNK_SIZE = 12;
const LOCALIZATION_WORKER_MIN_TOTAL_BYTES = 32 * 1024 * 1024;
const LOCALIZATION_WORKER_MIN_SINGLE_MOD_BYTES = 512 * 1024;
const LOCALIZATION_WORKER_MIN_SINGLE_MOD_FILES = 8;

const descriptorArtifactsCache = new Map<
  string,
  {
    baselineEntries: TranslationEntrySets;
    currentLanguageContribution: LanguageContribution;
    fingerprint: string;
    hasSelfTranslation: boolean;
  }
>();
const defsBaselineCache = new Map<string, CachedDefsBaseline>();

const modLocalizationPerfStats: ModLocalizationPerfStats = {
  defsDbHits: 0,
  defsDbMisses: 0,
  defsCacheHits: 0,
  defsCacheMisses: 0,
  descriptorDbHits: 0,
  descriptorDbMisses: 0,
  descriptorBuildMs: 0,
  descriptorCacheHits: 0,
  descriptorCacheMisses: 0,
  descriptorConcurrency: 0,
  fileConcurrency: 0,
  finalStatusBuildMs: 0,
  initialStatusBuildMs: 0,
  lastAnalyzeMs: 0,
  providerBitmapBuildMs: 0,
  recoveredFiles: 0,
  statusComputeMs: 0,
  strictParseFailures: 0,
  unrecoverableFiles: 0,
};

class LocalizationAnalysisProgressTracker {
  private readonly completedDescriptorIndices = new Set<number>();
  private readonly completedDefsIndices = new Set<number>();
  private hasCompletedCurrentLanguage = false;
  private lastReportedPercent = -1;

  constructor(
    private readonly entryCount: number,
    private readonly onProgress: (
      progress: ModLocalizationAnalysisProgress,
    ) => void,
  ) {
    this.report();
  }

  markCurrentLanguageResolved() {
    if (this.hasCompletedCurrentLanguage) {
      return;
    }

    this.hasCompletedCurrentLanguage = true;
    this.report();
  }

  markDescriptorIndicesResolved(indices: number[]) {
    let changed = false;

    for (const index of indices) {
      if (
        index < 0 ||
        index >= this.entryCount ||
        this.completedDescriptorIndices.has(index)
      ) {
        continue;
      }

      this.completedDescriptorIndices.add(index);
      changed = true;
    }

    if (changed) {
      this.report();
    }
  }

  markDefsIndicesResolved(indices: number[]) {
    let changed = false;

    for (const index of indices) {
      if (
        index < 0 ||
        index >= this.entryCount ||
        this.completedDefsIndices.has(index)
      ) {
        continue;
      }

      this.completedDefsIndices.add(index);
      changed = true;
    }

    if (changed) {
      this.report();
    }
  }

  markComplete() {
    this.markCurrentLanguageResolved();
    this.markDescriptorIndicesResolved(
      Array.from({ length: this.entryCount }, (_, index) => index),
    );
    this.markDefsIndicesResolved(
      Array.from({ length: this.entryCount }, (_, index) => index),
    );
  }

  private report() {
    const totalUnits = 1 + this.entryCount * 2;
    const completedUnits =
      Number(this.hasCompletedCurrentLanguage) +
      this.completedDescriptorIndices.size +
      this.completedDefsIndices.size;
    const percent =
      totalUnits <= 0
        ? 100
        : Math.min(100, Math.round((completedUnits / totalUnits) * 100));

    if (percent === this.lastReportedPercent) {
      return;
    }

    this.lastReportedPercent = percent;
    this.onProgress({
      completedUnits,
      percent,
      totalUnits,
    });
  }
}

function createEmptyTranslationEntrySets(): TranslationEntrySets {
  return createEmptyTranslationEntryVectors();
}

function createUnknownGameLanguage(): CurrentGameLanguage {
  return {
    folderName: null,
    normalizedFolderName: null,
    source: "unknown",
  };
}

function createEmptyMutableBucketedInventory(): MutableBucketedFileInventory {
  return {
    defInjected: [],
    keyed: [],
    strings: [],
    tokens: [],
  };
}

function finalizeBucketedInventory(
  inventory: MutableBucketedFileInventory,
): BucketedFileInventory {
  const sortByRelativePath = (
    left: FileInventoryEntry,
    right: FileInventoryEntry,
  ) => left.relativePath.localeCompare(right.relativePath);

  return {
    defInjected: [...inventory.defInjected].sort(sortByRelativePath),
    fingerprint: [...inventory.tokens].sort().join("\n"),
    keyed: [...inventory.keyed].sort(sortByRelativePath),
    strings: [...inventory.strings].sort(sortByRelativePath),
  };
}

function appendBucketedInventory(
  target: MutableBucketedFileInventory,
  source: BucketedFileInventory,
) {
  target.keyed.push(...source.keyed);
  target.defInjected.push(...source.defInjected);
  target.strings.push(...source.strings);

  if (source.fingerprint) {
    target.tokens.push(source.fingerprint);
  }
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

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(rootPath: string) {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const files: string[] = [];
  const pending = [rootPath];

  while (pending.length > 0) {
    const currentPath = pending.pop();

    if (!currentPath) {
      continue;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        pending.push(nextPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function normalizePathForId(value: string) {
  return value.replaceAll("\\", "/").toLowerCase();
}

function normalizePackageId(value: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

function normalizeLanguageFolderName(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const withoutSuffix = trimmed.split("(", 1)[0]?.trim() ?? trimmed;

  return withoutSuffix.replace(/[^A-Za-z0-9]+/g, "").toLowerCase() || null;
}

function normalizeXmlText(value: string) {
  return stripXmlControlCharacters(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      .replaceAll("&amp;", "&"),
    " ",
  )
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractGameVersionFolder(gameVersion: string | null) {
  if (!gameVersion) {
    return null;
  }

  const match = /(\d+\.\d+)/.exec(gameVersion);

  return match?.[1] ?? null;
}

function normalizeRelativeRoot(value: string) {
  const normalized = normalizeXmlText(value)
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");

  return normalized === "." ? "" : normalized;
}

function parseTagAttributes(rawAttributes: string) {
  const attributes = new Map<string, string>();
  const attributePattern = /([A-Za-z0-9:_.-]+)\s*=\s*"([^"]*)"/g;

  for (const match of rawAttributes.matchAll(attributePattern)) {
    const attributeName = match[1]?.trim().toLowerCase();
    const attributeValue = normalizeXmlText(match[2] ?? "");

    if (attributeName && attributeValue) {
      attributes.set(attributeName, attributeValue);
    }
  }

  return attributes;
}

function parseConditionalPackageIds(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/[;,]/)
    .map((entry) => normalizePackageId(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function sectionMatchesActiveMods(
  attributes: Map<string, string>,
  activePackageIds: Set<string>,
) {
  const requiredPackages = [
    ...parseConditionalPackageIds(attributes.get("ifmodactive")),
    ...parseConditionalPackageIds(attributes.get("mayrequire")),
  ];

  if (requiredPackages.some((packageId) => !activePackageIds.has(packageId))) {
    return false;
  }

  const blockedPackages = parseConditionalPackageIds(
    attributes.get("ifmodnotactive"),
  );

  if (blockedPackages.some((packageId) => activePackageIds.has(packageId))) {
    return false;
  }

  return true;
}

function extractLoadFolderSection(xml: string, sectionTagName: string) {
  const match = new RegExp(
    `<${escapeRegExp(sectionTagName)}\\b[^>]*>([\\s\\S]*?)</${escapeRegExp(sectionTagName)}>`,
    "i",
  ).exec(xml);

  return match?.[1] ?? null;
}

function parseRelativeRootsFromLoadFolders(args: {
  activePackageIds: Set<string>;
  gameVersion: string | null;
  xml: string;
}) {
  const roots = new Set<string>();
  const versionFolder = extractGameVersionFolder(args.gameVersion);
  const sectionTagNames = versionFolder
    ? [`v${versionFolder}`, "default"]
    : ["default"];
  const sectionXml =
    sectionTagNames
      .map((tagName) => extractLoadFolderSection(args.xml, tagName))
      .find((value): value is string => Boolean(value)) ?? args.xml;
  const itemPattern = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;

  for (const match of sectionXml.matchAll(itemPattern)) {
    const attributes = parseTagAttributes(match[1] ?? "");

    if (!sectionMatchesActiveMods(attributes, args.activePackageIds)) {
      continue;
    }

    const relativeRoot = normalizeRelativeRoot(match[2] ?? "");
    roots.add(relativeRoot);
  }

  return [...roots];
}

function createDefaultRelativeRoots(gameVersion: string | null) {
  const roots = new Set<string>(["", "Common"]);
  const versionFolder = extractGameVersionFolder(gameVersion);

  if (versionFolder) {
    roots.add(versionFolder);
  }

  return [...roots];
}

async function resolveModRelativeRoots(args: {
  activePackageIds: Set<string>;
  gameVersion: string | null;
  modReadablePath: string;
}) {
  const loadFoldersPath = join(args.modReadablePath, "LoadFolders.xml");

  if (!(await pathExists(loadFoldersPath))) {
    return createDefaultRelativeRoots(args.gameVersion);
  }

  try {
    const xml = await readDecodedXmlFile(loadFoldersPath);
    const relativeRoots = parseRelativeRootsFromLoadFolders({
      activePackageIds: args.activePackageIds,
      gameVersion: args.gameVersion,
      xml,
    });

    if (relativeRoots.length > 0) {
      return relativeRoots;
    }
  } catch {
    // Fall back to the default root heuristics if LoadFolders parsing fails.
  }

  return createDefaultRelativeRoots(args.gameVersion);
}

function getLocalizationWorkerPoolSize() {
  return Math.max(
    2,
    Math.min(MAX_LOCALIZATION_WORKERS, Math.ceil(availableParallelism() / 2)),
  );
}

function chunkTasks<TTask>(tasks: TTask[], chunkSize: number) {
  const chunks: TTask[][] = [];

  for (let index = 0; index < tasks.length; index += chunkSize) {
    chunks.push(tasks.slice(index, index + chunkSize));
  }

  return chunks;
}

class ReusableLocalizationWorkerPool {
  private queuedRun: Promise<void> = Promise.resolve();
  private workerUrl: string | null = null;
  private workers: Worker[] = [];

  reset() {
    for (const worker of this.workers) {
      worker.terminate();
    }

    this.workers = [];
    this.workerUrl = null;
  }

  async runLocalizationChunks(args: {
    poolSize: number;
    tasks: LocalizationWorkerParseTask[];
  }) {
    const execute = async () =>
      this.runChunksNow<LocalizationWorkerParseResult>({
        kind: "parse-localization",
        poolSize: args.poolSize,
        tasks: args.tasks,
      });
    const result = this.queuedRun.then(execute, execute);

    this.queuedRun = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  async runDefsChunks(args: {
    poolSize: number;
    tasks: DefsWorkerParseTask[];
  }) {
    const execute = async () =>
      this.runChunksNow<DefsWorkerParseResult>({
        kind: "parse-defs",
        poolSize: args.poolSize,
        tasks: args.tasks,
      });
    const result = this.queuedRun.then(execute, execute);

    this.queuedRun = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private ensureWorkerUrl() {
    if (this.workerUrl) {
      return this.workerUrl;
    }

    this.workerUrl = new URL(
      "./mod-localization.worker.ts",
      import.meta.url,
    ).href;

    return this.workerUrl;
  }

  private ensureWorkers(workerCount: number) {
    const workerUrl = this.ensureWorkerUrl();

    while (this.workers.length < workerCount) {
      this.workers.push(new Worker(workerUrl));
    }

    return this.workers.slice(0, workerCount);
  }

  private async runChunksNow<TResult>(args: {
    kind: LocalizationWorkerRequest["kind"];
    poolSize: number;
    tasks: LocalizationWorkerParseTask[] | DefsWorkerParseTask[];
  }) {
    if (args.tasks.length === 0) {
      return [] as TResult[];
    }

    const chunkedTasks =
      args.kind === "parse-localization"
        ? chunkTasks(
            args.tasks as LocalizationWorkerParseTask[],
            LOCALIZATION_WORKER_CHUNK_SIZE,
          )
        : chunkTasks(
            args.tasks as DefsWorkerParseTask[],
            LOCALIZATION_WORKER_CHUNK_SIZE,
          );
    const workerCount = Math.min(args.poolSize, chunkedTasks.length);
    const workers = this.ensureWorkers(workerCount);

    return new Promise<TResult[]>((resolve, reject) => {
      const results = new Array<TResult[]>(chunkedTasks.length);
      let idleWorkers = 0;
      let nextChunkIndex = 0;
      let completedChunks = 0;
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
          completedChunks !== chunkedTasks.length ||
          idleWorkers !== workers.length
        ) {
          return;
        }

        settled = true;
        clearHandlers();
        resolve(results.flat());
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
        const tasks = chunkedTasks[chunkId];

        if (!tasks) {
          idleWorkers += 1;
          resolveIfDone();
          return;
        }

        nextChunkIndex += 1;
        if (args.kind === "parse-localization") {
          worker.postMessage({
            chunkId,
            kind: args.kind,
            tasks: tasks as LocalizationWorkerParseTask[],
          } satisfies LocalizationWorkerRequest);
          return;
        }

        worker.postMessage({
          chunkId,
          kind: args.kind,
          tasks: tasks as DefsWorkerParseTask[],
        } satisfies LocalizationWorkerRequest);
      };

      for (const worker of workers) {
        worker.onmessage = (event: MessageEvent<LocalizationWorkerResponse>) => {
          const response = event.data;

          if (response.error) {
            fail(
              `Localization worker chunk ${response.chunkId} failed: ${response.error}`,
            );
            return;
          }

          results[response.chunkId] = response.results as TResult[];
          completedChunks += 1;
          assignNextChunk(worker);
          resolveIfDone();
        };

        worker.onerror = (event) => {
          fail(event.message || "Localization worker crashed.");
        };

        assignNextChunk(worker);
      }
    });
  }
}

const reusableLocalizationWorkerPool = new ReusableLocalizationWorkerPool();

function createAnalysisRuntime(): AnalysisRuntime {
  const parallelism = Math.max(2, availableParallelism());
  const descriptorConcurrency = Math.max(
    2,
    Math.min(MAX_LOCALIZATION_DESCRIPTOR_CONCURRENCY, parallelism),
  );
  const fileConcurrency = Math.max(
    descriptorConcurrency * 2,
    Math.min(MAX_LOCALIZATION_FILE_CONCURRENCY, parallelism * 4),
  );

  modLocalizationPerfStats.descriptorConcurrency = descriptorConcurrency;
  modLocalizationPerfStats.fileConcurrency = fileConcurrency;

  return {
    descriptorConcurrency,
    descriptorLimit: pLimit(descriptorConcurrency),
    fileConcurrency,
    fileLimit: pLimit(fileConcurrency),
    workerPoolSize: getLocalizationWorkerPoolSize(),
  };
}

async function collectFileInventory(args: {
  filter?: (filePath: string) => boolean;
  rootPath: string;
  runtime: AnalysisRuntime;
}) {
  if (!(await pathExists(args.rootPath))) {
    return [] as FileInventoryEntry[];
  }

  const filePaths = await listFilesRecursive(args.rootPath);
  const filteredFilePaths = args.filter
    ? filePaths.filter(args.filter)
    : filePaths;

  return Promise.all(
    filteredFilePaths.map((absolutePath) =>
      args.runtime.fileLimit(async () => {
        const fileStats = await stat(absolutePath, { bigint: true });
        const relativePath = normalizePathForId(
          relative(args.rootPath, absolutePath),
        );
        const mtimeToken = String(
          (fileStats as { mtimeNs?: bigint }).mtimeNs ??
            BigInt(Number(fileStats.mtimeMs)),
        );
        const fingerprintToken = `${relativePath}:${fileStats.size}:${mtimeToken}`;

        return {
          absolutePath,
          fingerprintToken,
          relativePath,
          size: Number(fileStats.size),
        } satisfies FileInventoryEntry;
      }),
    ),
  );
}

async function collectBucketedLocalizationFiles(args: {
  basePath: string;
  fingerprintPrefix: string;
  runtime: AnalysisRuntime;
}) {
  const [keyedFiles, defInjectedFiles, stringFiles] = await Promise.all([
    collectFileInventory({
      filter: (filePath) => filePath.toLowerCase().endsWith(".xml"),
      rootPath: join(args.basePath, "Keyed"),
      runtime: args.runtime,
    }),
    collectFileInventory({
      filter: (filePath) => filePath.toLowerCase().endsWith(".xml"),
      rootPath: join(args.basePath, "DefInjected"),
      runtime: args.runtime,
    }),
    collectFileInventory({
      rootPath: join(args.basePath, "Strings"),
      runtime: args.runtime,
    }),
  ]);

  const inventory = createEmptyMutableBucketedInventory();
  inventory.keyed.push(...keyedFiles);
  inventory.defInjected.push(...defInjectedFiles);
  inventory.strings.push(...stringFiles);

  for (const file of keyedFiles) {
    inventory.tokens.push(
      `${args.fingerprintPrefix}:keyed:${file.fingerprintToken}`,
    );
  }

  for (const file of defInjectedFiles) {
    inventory.tokens.push(
      `${args.fingerprintPrefix}:defInjected:${file.fingerprintToken}`,
    );
  }

  for (const file of stringFiles) {
    inventory.tokens.push(
      `${args.fingerprintPrefix}:strings:${file.fingerprintToken}`,
    );
  }

  return finalizeBucketedInventory(inventory);
}

async function collectLanguageContributionInventory(args: {
  currentLanguageFolderName: string | null;
  modReadablePath: string;
  relativeRoots: string[];
  runtime: AnalysisRuntime;
}) {
  const currentInventory = createEmptyMutableBucketedInventory();
  const englishInventory = createEmptyMutableBucketedInventory();
  const fingerprintTokens: string[] = [
    `currentLanguage:${args.currentLanguageFolderName ?? "null"}`,
    `relativeRoots:${args.relativeRoots.join("|")}`,
  ];
  let hasAnyLanguagesRoot = false;
  let matchedFolderName: string | null = null;

  for (const relativeRoot of args.relativeRoots) {
    const rootKey = relativeRoot || ".";
    const languagesPath = relativeRoot
      ? join(args.modReadablePath, relativeRoot, "Languages")
      : join(args.modReadablePath, "Languages");

    if (!(await pathExists(languagesPath))) {
      fingerprintTokens.push(`languages:${rootKey}:absent`);
      continue;
    }

    hasAnyLanguagesRoot = true;
    fingerprintTokens.push(`languages:${rootKey}:present`);
    const candidates = (await readdir(languagesPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    fingerprintTokens.push(`languages:${rootKey}:dirs:${candidates.join(",")}`);

    const currentFolderName =
      args.currentLanguageFolderName === null
        ? null
        : (candidates.find(
            (candidate) =>
              normalizeLanguageFolderName(candidate) ===
              args.currentLanguageFolderName,
          ) ?? null);
    const englishFolderName =
      candidates.find(
        (candidate) => normalizeLanguageFolderName(candidate) === "english",
      ) ?? null;

    if (currentFolderName) {
      matchedFolderName ??= currentFolderName;
      const currentFolderInventory = await collectBucketedLocalizationFiles({
        basePath: join(languagesPath, currentFolderName),
        fingerprintPrefix: `current:${rootKey}:${currentFolderName}`,
        runtime: args.runtime,
      });
      appendBucketedInventory(currentInventory, currentFolderInventory);
    }

    if (englishFolderName) {
      const englishFolderInventory = await collectBucketedLocalizationFiles({
        basePath: join(languagesPath, englishFolderName),
        fingerprintPrefix: `english:${rootKey}:${englishFolderName}`,
        runtime: args.runtime,
      });
      appendBucketedInventory(englishInventory, englishFolderInventory);
    }
  }

  const current = finalizeBucketedInventory(currentInventory);
  const english = finalizeBucketedInventory(englishInventory);

  if (current.fingerprint) {
    fingerprintTokens.push(`currentFingerprint:${current.fingerprint}`);
  }

  if (english.fingerprint) {
    fingerprintTokens.push(`englishFingerprint:${english.fingerprint}`);
  }

  return {
    current,
    english,
    fingerprint: fingerprintTokens.sort().join("\n"),
    hasAnyLanguagesRoot,
    matchedFolderName,
  } satisfies LanguageContributionInventory;
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

function mergeOrderedNumbers(left: number[], right: number[]) {
  const seen = new Set<number>();
  const merged: number[] = [];

  for (const value of left) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    merged.push(value);
  }

  for (const value of right) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    merged.push(value);
  }

  return merged;
}

function countEntries(entries: TranslationEntrySets) {
  return TRANSLATION_BUCKETS.reduce(
    (count, bucket) => count + entries[bucket].length,
    0,
  );
}

function hasAnyEntries(entries: TranslationEntrySets) {
  return countEntries(entries) > 0;
}

function createDefInjectedBaselineEntries(defInjectedIds: number[]) {
  return {
    defInjected: [...defInjectedIds],
    keyed: [],
    strings: [],
  } satisfies TranslationEntrySets;
}

function mergeTranslationEntries(
  left: TranslationEntrySets,
  right: TranslationEntrySets,
) {
  const merged = createEmptyTranslationEntrySets();

  for (const bucket of TRANSLATION_BUCKETS) {
    merged[bucket] = mergeOrderedNumbers(left[bucket], right[bucket]);
  }

  return merged;
}

function createDescriptorCacheKey(args: {
  currentLanguageFolderName: string | null;
  modReadablePath: string;
  relativeRoots: string[];
}) {
  return [
    args.modReadablePath,
    args.currentLanguageFolderName ?? "null",
    args.relativeRoots.join("|"),
  ].join("::");
}

async function parseBucketedLocalizationEntries(args: {
  inventory: BucketedFileInventory;
  runtime: AnalysisRuntime;
}) {
  const rawEntries = {
    defInjected: new Set<string>(),
    keyed: new Set<string>(),
    strings: new Set<string>(),
  };

  await Promise.all([
    ...args.inventory.keyed.map((file) =>
      args.runtime.fileLimit(async () => {
        try {
          const xml = await readDecodedXmlFile(file.absolutePath);
          collectKeyedIdsFromXml(xml, file.relativePath).forEach((id) =>
            rawEntries.keyed.add(id),
          );
        } catch {
          // Ignore unrecoverable malformed files so one bad translation file
          // cannot take down the whole analysis.
        }
      }),
    ),
    ...args.inventory.defInjected.map((file) =>
      args.runtime.fileLimit(async () => {
        try {
          const xml = await readDecodedXmlFile(file.absolutePath);
          const defType = file.relativePath.split("/", 1)[0];

          if (!defType) {
            return;
          }

          collectDefInjectedIdsFromXml(xml, defType).forEach((id) =>
            rawEntries.defInjected.add(id),
          );
        } catch {
          // Ignore unrecoverable malformed files so one bad translation file
          // cannot take down the whole analysis.
        }
      }),
    ),
    ...args.inventory.strings.map((file) =>
      args.runtime.fileLimit(async () => {
        const text = await readUtf8TextFile(file.absolutePath);
        collectStringsIdsFromText(text, file.relativePath).forEach((id) =>
          rawEntries.strings.add(id),
        );
      }),
    ),
  ]);

  return internTranslationEntrySets(rawEntries);
}

function toWorkerBucketedInventory(
  inventory: BucketedFileInventory,
): WorkerBucketedLocalizationInventory {
  return {
    defInjected: inventory.defInjected.map((file) => ({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
    })),
    keyed: inventory.keyed.map((file) => ({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
    })),
    strings: inventory.strings.map((file) => ({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
    })),
  };
}

function countInventoryFiles(inventory: BucketedFileInventory) {
  return (
    inventory.keyed.length +
    inventory.defInjected.length +
    inventory.strings.length
  );
}

function countInventoryBytes(inventory: BucketedFileInventory) {
  return [...inventory.keyed, ...inventory.defInjected, ...inventory.strings].reduce(
    (total, file) => total + file.size,
    0,
  );
}

function shouldUseLocalizationWorkers(misses: PreparedDescriptorMiss[]) {
  if (misses.length === 0) {
    return false;
  }

  let totalBytes = 0;

  for (const miss of misses) {
    const englishFiles = countInventoryFiles(miss.languageInventory.english);
    const currentFiles =
      miss.languageInventory.current.fingerprint ===
      miss.languageInventory.english.fingerprint
        ? 0
        : countInventoryFiles(miss.languageInventory.current);
    const modFiles = englishFiles + currentFiles;
    const modBytes =
      countInventoryBytes(miss.languageInventory.english) +
      (miss.languageInventory.current.fingerprint ===
      miss.languageInventory.english.fingerprint
        ? 0
        : countInventoryBytes(miss.languageInventory.current));

    totalBytes += modBytes;

    if (
      modFiles >= LOCALIZATION_WORKER_MIN_SINGLE_MOD_FILES ||
      modBytes >= LOCALIZATION_WORKER_MIN_SINGLE_MOD_BYTES
    ) {
      return true;
    }
  }

  return totalBytes >= LOCALIZATION_WORKER_MIN_TOTAL_BYTES;
}

function shouldUseDefsWorkers(misses: PreparedDefsBaselineMiss[]) {
  if (misses.length === 0) {
    return false;
  }

  let totalBytes = 0;

  for (const miss of misses) {
    const modBytes = miss.inventoryFiles.reduce(
      (sum, file) => sum + file.size,
      0,
    );

    totalBytes += modBytes;

    if (
      miss.inventoryFiles.length >= LOCALIZATION_WORKER_MIN_SINGLE_MOD_FILES ||
      modBytes >= LOCALIZATION_WORKER_MIN_SINGLE_MOD_BYTES
    ) {
      return true;
    }
  }

  return totalBytes >= LOCALIZATION_WORKER_MIN_TOTAL_BYTES;
}

async function parseLocalizationMissesWithWorkers(args: {
  misses: PreparedDescriptorMiss[];
  runtime: AnalysisRuntime;
}) {
  const workerTasks = args.misses.map((miss) => ({
    baseline: toWorkerBucketedInventory(miss.languageInventory.english),
    current:
      miss.languageInventory.current.fingerprint ===
      miss.languageInventory.english.fingerprint
        ? null
        : toWorkerBucketedInventory(miss.languageInventory.current),
    taskId: String(miss.index),
  })) satisfies LocalizationWorkerParseTask[];

  return reusableLocalizationWorkerPool.runLocalizationChunks({
    poolSize: args.runtime.workerPoolSize,
    tasks: workerTasks,
  });
}

async function parseDefsMissesWithWorkers(args: {
  misses: PreparedDefsBaselineMiss[];
  runtime: AnalysisRuntime;
}) {
  const workerTasks = args.misses.map((miss) => ({
    files: miss.inventoryFiles.map((file) => file.absolutePath),
    taskId: miss.modReadablePath,
  })) satisfies DefsWorkerParseTask[];

  return reusableLocalizationWorkerPool.runDefsChunks({
    poolSize: args.runtime.workerPoolSize,
    tasks: workerTasks,
  });
}

function collectDependencyTargets(entry: ModSourceSnapshotEntry) {
  const parsedAbout = entry.aboutXmlText
    ? parseAboutXml(entry.aboutXmlText)
    : null;
  const packageIds = new Set<string>();

  for (const packageId of [
    ...(parsedAbout?.dependencyMetadata.dependencies ?? []),
    ...(parsedAbout?.dependencyMetadata.loadAfter ?? []),
    ...(parsedAbout?.dependencyMetadata.loadBefore ?? []),
    ...(parsedAbout?.dependencyMetadata.forceLoadAfter ?? []),
    ...(parsedAbout?.dependencyMetadata.forceLoadBefore ?? []),
  ]) {
    const normalized = normalizePackageId(packageId);

    if (normalized) {
      packageIds.add(normalized);
    }
  }

  return {
    dependencyTargets: packageIds,
    packageIdNormalized:
      parsedAbout?.dependencyMetadata.packageIdNormalized ?? null,
  };
}

async function prepareDescriptorFromCache(args: {
  currentGameLanguage: CurrentGameLanguage;
  entry: ModSourceSnapshotEntry;
  metadata: ReturnType<typeof collectDependencyTargets>;
  relativeRoots: string[];
  runtime: AnalysisRuntime;
}): Promise<PreparedDescriptorResolution> {
  const languageInventory = await collectLanguageContributionInventory({
    currentLanguageFolderName: args.currentGameLanguage.normalizedFolderName,
    modReadablePath: args.entry.modReadablePath,
    relativeRoots: args.relativeRoots,
    runtime: args.runtime,
  });
  const cacheKey = createDescriptorCacheKey({
    currentLanguageFolderName: args.currentGameLanguage.normalizedFolderName,
    modReadablePath: args.entry.modReadablePath,
    relativeRoots: args.relativeRoots,
  });
  const cached = descriptorArtifactsCache.get(cacheKey);

  if (cached && cached.fingerprint === languageInventory.fingerprint) {
    modLocalizationPerfStats.descriptorCacheHits += 1;

    return {
      kind: "hit",
      descriptor: {
        baselineEntries: cached.baselineEntries,
        currentLanguageContribution: cached.currentLanguageContribution,
        descriptorFingerprint: cached.fingerprint,
        dependencyTargets: args.metadata.dependencyTargets,
        entry: args.entry,
        hasSelfTranslation: cached.hasSelfTranslation,
        packageIdNormalized: args.metadata.packageIdNormalized,
        relativeRoots: args.relativeRoots,
      } satisfies ModLocalizationDescriptor,
    };
  }

  const persisted = loadCachedDescriptorArtifacts({
    cacheKey,
    fingerprint: languageInventory.fingerprint,
  });

  if (persisted) {
    modLocalizationPerfStats.descriptorCacheHits += 1;
    modLocalizationPerfStats.descriptorDbHits += 1;

    const currentLanguageContribution = {
      entries: cloneTranslationEntryVectors(
        persisted.currentLanguageContribution.entries,
      ),
      hasAnyLanguagesRoot: persisted.currentLanguageContribution.hasAnyLanguagesRoot,
      matchedFolderName: persisted.currentLanguageContribution.matchedFolderName,
    } satisfies LanguageContribution;
    const baselineEntries = cloneTranslationEntryVectors(
      persisted.baselineEntries,
    );

    descriptorArtifactsCache.set(cacheKey, {
      baselineEntries,
      currentLanguageContribution,
      fingerprint: persisted.fingerprint,
      hasSelfTranslation: persisted.hasSelfTranslation,
    });

    return {
      kind: "hit",
      descriptor: {
        baselineEntries,
        currentLanguageContribution,
        descriptorFingerprint: persisted.fingerprint,
        dependencyTargets: args.metadata.dependencyTargets,
        entry: args.entry,
        hasSelfTranslation: persisted.hasSelfTranslation,
        packageIdNormalized: args.metadata.packageIdNormalized,
        relativeRoots: args.relativeRoots,
      } satisfies ModLocalizationDescriptor,
    };
  }

  modLocalizationPerfStats.descriptorCacheMisses += 1;
  modLocalizationPerfStats.descriptorDbMisses += 1;
  return {
    entry: args.entry,
    kind: "miss",
    languageInventory,
    metadata: args.metadata,
    relativeRoots: args.relativeRoots,
    cacheKey,
  };
}

function buildDescriptorFromParsedArtifacts(args: {
  baselineEntries: TranslationEntrySets;
  cacheKey: string;
  currentEntries: TranslationEntrySets;
  entry: ModSourceSnapshotEntry;
  fingerprint: string;
  hasAnyLanguagesRoot: boolean;
  matchedFolderName: string | null;
  metadata: ReturnType<typeof collectDependencyTargets>;
  relativeRoots: string[];
}) {
  const currentLanguageContribution = {
    entries: args.currentEntries,
    hasAnyLanguagesRoot: args.hasAnyLanguagesRoot,
    matchedFolderName: args.matchedFolderName,
  } satisfies LanguageContribution;
  const hasSelfTranslation = hasAnyEntries(args.currentEntries);

  descriptorArtifactsCache.set(args.cacheKey, {
    baselineEntries: args.baselineEntries,
    currentLanguageContribution,
    fingerprint: args.fingerprint,
    hasSelfTranslation,
  });
  saveCachedDescriptorArtifacts({
    artifacts: {
      baselineEntries: args.baselineEntries,
      currentLanguageContribution,
      fingerprint: args.fingerprint,
      hasSelfTranslation,
    },
    cacheKey: args.cacheKey,
  });

  return {
    baselineEntries: args.baselineEntries,
    currentLanguageContribution,
    descriptorFingerprint: args.fingerprint,
    dependencyTargets: args.metadata.dependencyTargets,
    entry: args.entry,
    hasSelfTranslation,
    packageIdNormalized: args.metadata.packageIdNormalized,
    relativeRoots: args.relativeRoots,
  } satisfies ModLocalizationDescriptor;
}

function createDefsCacheKey(descriptor: ModLocalizationDescriptor) {
  return `${descriptor.entry.modReadablePath}::${descriptor.relativeRoots.join("|")}`;
}

async function collectDefsInventory(args: {
  modReadablePath: string;
  relativeRoots: string[];
  runtime: AnalysisRuntime;
}) {
  const tokens: string[] = [`relativeRoots:${args.relativeRoots.join("|")}`];
  const files: FileInventoryEntry[] = [];

  for (const relativeRoot of args.relativeRoots) {
    const rootKey = relativeRoot || ".";
    const defsPath = relativeRoot
      ? join(args.modReadablePath, relativeRoot, "Defs")
      : join(args.modReadablePath, "Defs");

    if (!(await pathExists(defsPath))) {
      tokens.push(`defs:${rootKey}:absent`);
      continue;
    }

    tokens.push(`defs:${rootKey}:present`);
    const rootFiles = await collectFileInventory({
      filter: (filePath) => filePath.toLowerCase().endsWith(".xml"),
      rootPath: defsPath,
      runtime: args.runtime,
    });

    files.push(...rootFiles);

    for (const file of rootFiles) {
      tokens.push(`defs:${rootKey}:${file.fingerprintToken}`);
    }
  }

  return {
    files: files.sort((left, right) =>
      left.absolutePath.localeCompare(right.absolutePath),
    ),
    fingerprint: tokens.sort().join("\n"),
  };
}

async function prepareDefsBaselineIdsCached(args: {
  descriptor: ModLocalizationDescriptor;
  runtime: AnalysisRuntime;
}): Promise<number[] | PreparedDefsBaselineMiss> {
  const inventory = await collectDefsInventory({
    modReadablePath: args.descriptor.entry.modReadablePath,
    relativeRoots: args.descriptor.relativeRoots,
    runtime: args.runtime,
  });
  const cacheKey = createDefsCacheKey(args.descriptor);
  const cached = defsBaselineCache.get(cacheKey);

  if (cached && cached.fingerprint === inventory.fingerprint) {
    modLocalizationPerfStats.defsCacheHits += 1;
    return cached.ids;
  }

  const persisted = loadCachedDefsBaseline({
    cacheKey,
    fingerprint: inventory.fingerprint,
  });

  if (persisted) {
    modLocalizationPerfStats.defsCacheHits += 1;
    modLocalizationPerfStats.defsDbHits += 1;
    defsBaselineCache.set(cacheKey, {
      fingerprint: persisted.fingerprint,
      ids: [...persisted.ids],
    });

    return persisted.ids;
  }

  modLocalizationPerfStats.defsCacheMisses += 1;
  modLocalizationPerfStats.defsDbMisses += 1;

  return {
    cacheKey,
    descriptor: args.descriptor,
    fingerprint: inventory.fingerprint,
    indexGroups: [],
    inventoryFiles: inventory.files,
    modReadablePath: args.descriptor.entry.modReadablePath,
  } satisfies PreparedDefsBaselineMiss;
}

function addMapArrayValue<TKey, TValue>(
  map: Map<TKey, TValue[]>,
  key: TKey,
  value: TValue,
) {
  const existing = map.get(key);

  if (existing) {
    existing.push(value);
    return;
  }

  map.set(key, [value]);
}

function setProviderBit(bitset: Uint32Array, ordinal: number) {
  bitset[ordinal >>> 5] |= 1 << (ordinal & 31);
}

function bitsetsIntersect(left: Uint32Array, right: Uint32Array) {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    if ((left[index] & right[index]) !== 0) {
      return true;
    }
  }

  return false;
}

function createSortedNumbers(values: number[]) {
  if (values.length <= 1) {
    return values;
  }

  return [...values].sort((left, right) => left - right);
}

function hasSortedNumber(values: number[], target: number) {
  let low = 0;
  let high = values.length - 1;

  while (low <= high) {
    const middle = (low + high) >>> 1;
    const value = values[middle];

    if (value === target) {
      return true;
    }

    if (value < target) {
      low = middle + 1;
      continue;
    }

    high = middle - 1;
  }

  return false;
}

function buildProviderIndex(descriptors: ModLocalizationDescriptor[]) {
  const byDependencyTarget = new Map<string, number[]>();
  const providerWordCount = Math.ceil(descriptors.length / 32);
  const byTranslationIdBitmap = {
    defInjected: new Map<number, Uint32Array>(),
    keyed: new Map<number, Uint32Array>(),
    strings: new Map<number, Uint32Array>(),
  } satisfies Record<TranslationBucket, Map<number, Uint32Array>>;
  const byTranslationIdOrdered = {
    defInjected: new Map<number, number[]>(),
    keyed: new Map<number, number[]>(),
    strings: new Map<number, number[]>(),
  } satisfies Record<TranslationBucket, Map<number, number[]>>;
  const providerOrdinalsByPackageId = new Map<string, number>();

  for (const [ordinal, descriptor] of descriptors.entries()) {
    const packageId = descriptor.packageIdNormalized;

    if (!packageId) {
      continue;
    }

    providerOrdinalsByPackageId.set(packageId, ordinal);

    for (const targetPackageId of descriptor.dependencyTargets) {
      addMapArrayValue(byDependencyTarget, targetPackageId, ordinal);
    }

    for (const bucket of TRANSLATION_BUCKETS) {
      for (const translationId of descriptor.currentLanguageContribution.entries[
        bucket
      ]) {
        addMapArrayValue(byTranslationIdOrdered[bucket], translationId, ordinal);
        const bitmap = byTranslationIdBitmap[bucket].get(translationId);

        if (bitmap) {
          setProviderBit(bitmap, ordinal);
          continue;
        }

        const nextBitmap = new Uint32Array(providerWordCount);
        setProviderBit(nextBitmap, ordinal);
        byTranslationIdBitmap[bucket].set(translationId, nextBitmap);
      }
    }
  }

  return {
    byDependencyTarget,
    byTranslationIdBitmap,
    byTranslationIdOrdered,
    providerOrdinalsByPackageId,
    providerWordCount,
    providersByOrdinal: descriptors,
  } satisfies ProviderIndex;
}

function collectCandidateProviders(args: {
  descriptor: ModLocalizationDescriptor;
  providerIndex: ProviderIndex;
}) {
  const candidateProviderBits = new Uint32Array(
    args.providerIndex.providerWordCount,
  );
  const candidateProviderOrdinals: number[] = [];
  const seenOrdinals = new Uint8Array(args.providerIndex.providersByOrdinal.length);
  const selfOrdinal =
    args.descriptor.packageIdNormalized === null
      ? undefined
      : args.providerIndex.providerOrdinalsByPackageId.get(
          args.descriptor.packageIdNormalized,
        );

  const pushOrdinal = (ordinal: number) => {
    if (ordinal < 0 || ordinal >= seenOrdinals.length) {
      return;
    }

    if (selfOrdinal === ordinal || seenOrdinals[ordinal] === 1) {
      return;
    }

    seenOrdinals[ordinal] = 1;
    candidateProviderOrdinals.push(ordinal);
    setProviderBit(candidateProviderBits, ordinal);
  };

  if (args.descriptor.packageIdNormalized) {
    const dependencyProviders = args.providerIndex.byDependencyTarget.get(
      args.descriptor.packageIdNormalized,
    );

    dependencyProviders?.forEach(pushOrdinal);
  }

  for (const bucket of TRANSLATION_BUCKETS) {
    for (const translationId of args.descriptor.baselineEntries[bucket]) {
      const overlapProviders =
        args.providerIndex.byTranslationIdOrdered[bucket].get(translationId);

      overlapProviders?.forEach(pushOrdinal);
    }
  }

  return {
    candidateProviderBits,
    candidateProviderOrdinals,
  };
}

function computeCoveredEntries(args: {
  baselineEntries: TranslationEntrySets;
  candidateProviderBits: Uint32Array;
  providerIndex: ProviderIndex;
  selfEntries: TranslationEntrySets | null;
}) {
  const sortedSelfEntries = args.selfEntries
    ? {
        defInjected: createSortedNumbers(args.selfEntries.defInjected),
        keyed: createSortedNumbers(args.selfEntries.keyed),
        strings: createSortedNumbers(args.selfEntries.strings),
      }
    : null;
  let coveredEntries = 0;

  for (const bucket of TRANSLATION_BUCKETS) {
    for (const translationId of args.baselineEntries[bucket]) {
      if (
        sortedSelfEntries &&
        hasSortedNumber(sortedSelfEntries[bucket], translationId)
      ) {
        coveredEntries += 1;
        continue;
      }

      const bitmap = args.providerIndex.byTranslationIdBitmap[bucket].get(
        translationId,
      );

      if (bitmap && bitsetsIntersect(bitmap, args.candidateProviderBits)) {
        coveredEntries += 1;
      }
    }
  }

  return coveredEntries;
}

function countTranslatedEntriesWithoutBaseline(args: {
  candidateProviderOrdinals: number[];
  descriptor: ModLocalizationDescriptor;
  memo: Map<string, number>;
  providerIndex: ProviderIndex;
}) {
  const memoKey = `${args.descriptor.descriptorFingerprint}::${args.candidateProviderOrdinals.join(",")}`;
  const cached = args.memo.get(memoKey);

  if (cached !== undefined) {
    return cached;
  }

  const translatedEntries = new Set<number>();

  if (args.descriptor.hasSelfTranslation) {
    for (const bucket of TRANSLATION_BUCKETS) {
      for (const translationId of args.descriptor.currentLanguageContribution
        .entries[bucket]) {
        translatedEntries.add(translationId);
      }
    }
  }

  for (const ordinal of args.candidateProviderOrdinals) {
    const provider = args.providerIndex.providersByOrdinal[ordinal];

    if (!provider) {
      continue;
    }

    for (const bucket of TRANSLATION_BUCKETS) {
      for (const translationId of provider.currentLanguageContribution.entries[
        bucket
      ]) {
        translatedEntries.add(translationId);
      }
    }
  }

  const translatedEntryCount = translatedEntries.size;
  args.memo.set(memoKey, translatedEntryCount);
  return translatedEntryCount;
}

function buildCoverage(args: {
  coveredEntries: number;
  totalEntries: number;
  translatedEntryCount: number;
}): ModLocalizationStatus["coverage"] {
  if (args.totalEntries <= 0) {
    return {
      completeness: "unknown" as const,
      coveredEntries: args.translatedEntryCount,
      totalEntries: null,
      percent: null,
    };
  }

  const percent =
    Math.round((args.coveredEntries / args.totalEntries) * 1000) / 10;
  const completeness: ModLocalizationStatus["coverage"]["completeness"] =
    args.coveredEntries >= args.totalEntries ? "complete" : "partial";

  return {
    completeness,
    coveredEntries: args.coveredEntries,
    totalEntries: args.totalEntries,
    percent,
  };
}

function buildLocalizationStatus(args: {
  currentGameLanguage: CurrentGameLanguage;
  descriptor: ModLocalizationDescriptor;
  providerIndex: ProviderIndex;
  translatedEntryCountMemo: Map<string, number>;
}) {
  const providerPackageIds: string[] = [];
  let matchedFolderName: string | null =
    args.descriptor.currentLanguageContribution.matchedFolderName;
  const { candidateProviderBits, candidateProviderOrdinals } =
    collectCandidateProviders(args);

  if (args.descriptor.hasSelfTranslation) {
    if (args.descriptor.packageIdNormalized) {
      providerPackageIds.push(args.descriptor.packageIdNormalized);
    }
  }

  for (const providerOrdinal of candidateProviderOrdinals) {
    const provider = args.providerIndex.providersByOrdinal[providerOrdinal];

    if (!provider?.packageIdNormalized) {
      continue;
    }

    providerPackageIds.push(provider.packageIdNormalized);
    matchedFolderName ??=
      provider.currentLanguageContribution.matchedFolderName;
  }

  const hasTranslatedEntries =
    args.descriptor.hasSelfTranslation || candidateProviderOrdinals.length > 0;
  const baselineEntryCount = countEntries(args.descriptor.baselineEntries);

  if (hasTranslatedEntries) {
    const coveredEntries =
      baselineEntryCount > 0
        ? computeCoveredEntries({
            baselineEntries: args.descriptor.baselineEntries,
            candidateProviderBits,
            providerIndex: args.providerIndex,
            selfEntries: args.descriptor.hasSelfTranslation
              ? args.descriptor.currentLanguageContribution.entries
              : null,
          })
        : countTranslatedEntriesWithoutBaseline({
            candidateProviderOrdinals,
            descriptor: args.descriptor,
            memo: args.translatedEntryCountMemo,
            providerIndex: args.providerIndex,
          });

    return {
      kind: "translated",
      isSupported: true,
      matchedFolderName,
      providerPackageIds,
      coverage: buildCoverage({
        coveredEntries,
        totalEntries: baselineEntryCount,
        translatedEntryCount: baselineEntryCount > 0 ? 0 : coveredEntries,
      }),
    } satisfies ModLocalizationStatus;
  }

  if (
    !args.currentGameLanguage.normalizedFolderName &&
    args.descriptor.currentLanguageContribution.hasAnyLanguagesRoot
  ) {
    return {
      kind: "unknown",
      isSupported: false,
      matchedFolderName: null,
      providerPackageIds: [],
      coverage: {
        completeness: "unknown",
        coveredEntries: 0,
        totalEntries: baselineEntryCount > 0 ? baselineEntryCount : null,
        percent: null,
      },
    } satisfies ModLocalizationStatus;
  }

  if (
    args.currentGameLanguage.normalizedFolderName &&
    args.descriptor.currentLanguageContribution.hasAnyLanguagesRoot &&
    args.descriptor.currentLanguageContribution.matchedFolderName === null
  ) {
    return {
      ...LOCALIZATION_STATUS_MISSING_LANGUAGE,
      coverage: {
        ...LOCALIZATION_STATUS_MISSING_LANGUAGE.coverage,
        totalEntries: baselineEntryCount > 0 ? baselineEntryCount : null,
      },
    };
  }

  return {
    ...LOCALIZATION_STATUS_MISSING,
    coverage: {
      ...LOCALIZATION_STATUS_MISSING.coverage,
      totalEntries: baselineEntryCount > 0 ? baselineEntryCount : null,
    },
  };
}

async function buildDescriptors(args: {
  activePackageIds: Set<string>;
  currentGameLanguage: CurrentGameLanguage;
  entries: ModSourceSnapshotEntry[];
  gameVersion: string | null;
  onDescriptorIndicesResolved?: (indices: number[]) => void;
  runtime: AnalysisRuntime;
}) {
  const metadataByEntry = args.entries.map((entry) =>
    collectDependencyTargets(entry),
  );
  const descriptors = new Array<ModLocalizationDescriptor>(args.entries.length);
  const misses: PreparedDescriptorMiss[] = [];

  await Promise.all(
    args.entries.map((entry, index) =>
      args.runtime.descriptorLimit(async () => {
        const resolution = await prepareDescriptorFromCache({
          currentGameLanguage: args.currentGameLanguage,
          entry,
          metadata: metadataByEntry[index] ?? collectDependencyTargets(entry),
          relativeRoots: await resolveModRelativeRoots({
            activePackageIds: args.activePackageIds,
            gameVersion: args.gameVersion,
            modReadablePath: entry.modReadablePath,
          }),
          runtime: args.runtime,
        });

        if (resolution.kind === "hit") {
          descriptors[index] = resolution.descriptor;
          args.onDescriptorIndicesResolved?.([index]);
          return;
        }

        misses.push({
          ...resolution,
          index,
        });
      }),
    ),
  );

  if (misses.length === 0) {
    return descriptors.map((descriptor, index) => {
      if (!descriptor) {
        throw new Error(`Expected localization descriptor at index ${index}.`);
      }

      return descriptor;
    });
  }

  const missesByIndex = new Map(
    misses.map((miss) => [miss.index, miss] satisfies [number, PreparedDescriptorMiss]),
  );

  try {
    if (shouldUseLocalizationWorkers(misses)) {
      const workerResults = await parseLocalizationMissesWithWorkers({
        misses,
        runtime: args.runtime,
      });

      for (const result of workerResults) {
        const index = Number.parseInt(result.taskId, 10);
        const miss = missesByIndex.get(index);

        if (!miss) {
          continue;
        }

        const baselineEntries = internTranslationEntrySets({
          defInjected: new Set(result.baseline.defInjected),
          keyed: new Set(result.baseline.keyed),
          strings: new Set(result.baseline.strings),
        });
        const currentEntries =
          result.current === null
            ? cloneTranslationEntryVectors(baselineEntries)
            : internTranslationEntrySets({
                defInjected: new Set(result.current.defInjected),
                keyed: new Set(result.current.keyed),
                strings: new Set(result.current.strings),
              });

        descriptors[index] = buildDescriptorFromParsedArtifacts({
          baselineEntries,
          cacheKey: miss.cacheKey,
          currentEntries,
          entry: miss.entry,
          fingerprint: miss.languageInventory.fingerprint,
          hasAnyLanguagesRoot: miss.languageInventory.hasAnyLanguagesRoot,
          matchedFolderName: miss.languageInventory.matchedFolderName,
          metadata: miss.metadata,
          relativeRoots: miss.relativeRoots,
        });
      }

      args.onDescriptorIndicesResolved?.(misses.map((miss) => miss.index));
      return descriptors.map((descriptor, index) => {
        if (!descriptor) {
          throw new Error(`Expected localization descriptor at index ${index}.`);
        }

        return descriptor;
      });
    }
  } catch {
    // Fall back to the main thread parser when workers are unavailable
    // or when the worker request itself fails.
  }

  {
    await Promise.all(
      misses.map((miss) =>
        args.runtime.descriptorLimit(async () => {
          const baselineEntries = await parseBucketedLocalizationEntries({
            inventory: miss.languageInventory.english,
            runtime: args.runtime,
          });
          const currentEntries =
            miss.languageInventory.current.fingerprint ===
            miss.languageInventory.english.fingerprint
              ? cloneTranslationEntryVectors(baselineEntries)
              : await parseBucketedLocalizationEntries({
                  inventory: miss.languageInventory.current,
                  runtime: args.runtime,
                });

          descriptors[miss.index] = buildDescriptorFromParsedArtifacts({
            baselineEntries,
            cacheKey: miss.cacheKey,
            currentEntries,
            entry: miss.entry,
            fingerprint: miss.languageInventory.fingerprint,
            hasAnyLanguagesRoot: miss.languageInventory.hasAnyLanguagesRoot,
            matchedFolderName: miss.languageInventory.matchedFolderName,
            metadata: miss.metadata,
            relativeRoots: miss.relativeRoots,
          });
        }),
      ),
    );
  }

  args.onDescriptorIndicesResolved?.(misses.map((miss) => miss.index));
  return descriptors.map((descriptor, index) => {
    if (!descriptor) {
      throw new Error(`Expected localization descriptor at index ${index}.`);
    }

    return descriptor;
  });
}

async function hydrateDescriptorsWithDefsBaselines(args: {
  descriptors: ModLocalizationDescriptor[];
  initialStatuses: ModLocalizationStatus[];
  onDefsIndicesResolved?: (indices: number[]) => void;
  runtime: AnalysisRuntime;
}) {
  const skippedIndices: number[] = [];
  const pendingDescriptorIndicesByPath = new Map<string, number[]>();

  for (const [index, descriptor] of args.descriptors.entries()) {
    const initialStatus = args.initialStatuses[index];

    if (
      !initialStatus ||
      initialStatus.kind !== "translated" ||
      countEntries(descriptor.baselineEntries) > 0
    ) {
      skippedIndices.push(index);
      continue;
    }

    const existingIndices =
      pendingDescriptorIndicesByPath.get(descriptor.entry.modReadablePath) ?? [];
    existingIndices.push(index);
    pendingDescriptorIndicesByPath.set(
      descriptor.entry.modReadablePath,
      existingIndices,
    );
  }

  if (skippedIndices.length > 0) {
    args.onDefsIndicesResolved?.(skippedIndices);
  }

  if (pendingDescriptorIndicesByPath.size === 0) {
    return args.descriptors;
  }

  const defsBaselineByPath = new Map<string, number[]>();
  const missByPath = new Map<string, PreparedDefsBaselineMiss>();

  await Promise.all(
    [...pendingDescriptorIndicesByPath.entries()].map(
      ([modReadablePath, indices]) =>
      args.runtime.descriptorLimit(async () => {
        const descriptor = args.descriptors[indices[0] ?? -1];

        if (!descriptor) {
          return;
        }

          const prepared = await prepareDefsBaselineIdsCached({
            descriptor,
            runtime: args.runtime,
          });

          if (Array.isArray(prepared)) {
            defsBaselineByPath.set(modReadablePath, prepared);
            args.onDefsIndicesResolved?.(indices);
            return;
          }

          missByPath.set(modReadablePath, {
            ...prepared,
            indexGroups: [indices],
          });
        }),
    ),
  );

  const misses = [...missByPath.values()];

  if (misses.length > 0) {
    try {
      if (shouldUseDefsWorkers(misses)) {
        const workerResults = await parseDefsMissesWithWorkers({
          misses,
          runtime: args.runtime,
        });

        for (const result of workerResults) {
          const miss = missByPath.get(result.taskId);

          if (!miss) {
            continue;
          }

          const ids = internTranslationIdsForBucket(
            "defInjected",
            new Set(result.ids),
          );

          defsBaselineCache.set(miss.cacheKey, {
            fingerprint: miss.fingerprint,
            ids,
          });
          saveCachedDefsBaseline({
            cacheKey: miss.cacheKey,
            record: {
              fingerprint: miss.fingerprint,
              ids,
            },
          });
          defsBaselineByPath.set(miss.modReadablePath, ids);
          args.onDefsIndicesResolved?.(miss.indexGroups.flat());
        }

        return args.descriptors.map((descriptor, index) => {
          const initialStatus = args.initialStatuses[index];

          if (
            !initialStatus ||
            initialStatus.kind !== "translated" ||
            countEntries(descriptor.baselineEntries) > 0
          ) {
            return descriptor;
          }

          const defsBaselineEntries = defsBaselineByPath.get(
            descriptor.entry.modReadablePath,
          );

          if (!defsBaselineEntries || defsBaselineEntries.length === 0) {
            return descriptor;
          }

          return {
            ...descriptor,
            baselineEntries: mergeTranslationEntries(
              descriptor.baselineEntries,
              createDefInjectedBaselineEntries(defsBaselineEntries),
            ),
          } satisfies ModLocalizationDescriptor;
        });
      }
    } catch {
      // Fall back to the main thread parser when workers are unavailable
      // or when the worker request itself fails.
    }

    {
      await Promise.all(
        misses.map((miss) =>
          args.runtime.descriptorLimit(async () => {
            const rawIds = new Set<string>();

            await Promise.all(
              miss.inventoryFiles.map((file) =>
                args.runtime.fileLimit(async () => {
                  try {
                    const xml = await readDecodedXmlFile(file.absolutePath);
                    collectDefsBaselineIdsFromXml(xml).forEach((id) =>
                      rawIds.add(id),
                    );
                  } catch {
                    // Ignore unrecoverable malformed files so one bad defs file
                    // cannot take down the whole analysis.
                  }
                }),
              ),
            );

            const ids = internTranslationIdsForBucket("defInjected", rawIds);

            defsBaselineCache.set(miss.cacheKey, {
              fingerprint: miss.fingerprint,
              ids,
            });
            saveCachedDefsBaseline({
              cacheKey: miss.cacheKey,
              record: {
                fingerprint: miss.fingerprint,
                ids,
              },
            });
            defsBaselineByPath.set(miss.modReadablePath, ids);
            args.onDefsIndicesResolved?.(miss.indexGroups.flat());
          }),
        ),
      );
    }
  }

  return args.descriptors.map((descriptor, index) => {
    const initialStatus = args.initialStatuses[index];

    if (
      !initialStatus ||
      initialStatus.kind !== "translated" ||
      countEntries(descriptor.baselineEntries) > 0
    ) {
      return descriptor;
    }

    const defsBaselineEntries = defsBaselineByPath.get(
      descriptor.entry.modReadablePath,
    );

    if (!defsBaselineEntries || defsBaselineEntries.length === 0) {
      return descriptor;
    }

    return {
      ...descriptor,
      baselineEntries: mergeTranslationEntries(
        descriptor.baselineEntries,
        createDefInjectedBaselineEntries(defsBaselineEntries),
      ),
    } satisfies ModLocalizationDescriptor;
  });
}

export function getModLocalizationPerfStatsForTests() {
  const xmlRecoveryStats = getXmlRecoveryStatsForTests();

  return {
    ...modLocalizationPerfStats,
    recoveredFiles: xmlRecoveryStats.recoveredFiles,
    strictParseFailures: xmlRecoveryStats.strictParseFailures,
    unrecoverableFiles: xmlRecoveryStats.unrecoverableFiles,
  };
}

export function resetModLocalizationPerfStateForTests() {
  descriptorArtifactsCache.clear();
  defsBaselineCache.clear();
  reusableLocalizationWorkerPool.reset();
  modLocalizationPerfStats.defsDbHits = 0;
  modLocalizationPerfStats.defsDbMisses = 0;
  modLocalizationPerfStats.defsCacheHits = 0;
  modLocalizationPerfStats.defsCacheMisses = 0;
  modLocalizationPerfStats.descriptorDbHits = 0;
  modLocalizationPerfStats.descriptorDbMisses = 0;
  modLocalizationPerfStats.descriptorBuildMs = 0;
  modLocalizationPerfStats.descriptorCacheHits = 0;
  modLocalizationPerfStats.descriptorCacheMisses = 0;
  modLocalizationPerfStats.descriptorConcurrency = 0;
  modLocalizationPerfStats.fileConcurrency = 0;
  modLocalizationPerfStats.finalStatusBuildMs = 0;
  modLocalizationPerfStats.initialStatusBuildMs = 0;
  modLocalizationPerfStats.lastAnalyzeMs = 0;
  modLocalizationPerfStats.providerBitmapBuildMs = 0;
  modLocalizationPerfStats.recoveredFiles = 0;
  modLocalizationPerfStats.statusComputeMs = 0;
  modLocalizationPerfStats.strictParseFailures = 0;
  modLocalizationPerfStats.unrecoverableFiles = 0;
  resetLocalizationIndexStateForTests();
  resetXmlRecoveryStatsForTests();
}

export async function readCurrentGameLanguage(args: {
  configPath: string | null;
  toReadablePath: (windowsPath: string) => string | null;
}) {
  if (!args.configPath) {
    return createUnknownGameLanguage();
  }

  const prefsWindowsPath = win32.join(args.configPath, "Prefs.xml");
  const prefsReadablePath = args.toReadablePath(prefsWindowsPath);

  if (!prefsReadablePath || !(await pathExists(prefsReadablePath))) {
    return createUnknownGameLanguage();
  }

  try {
    const xml = await readDecodedXmlFile(prefsReadablePath);
    const folderName = extractFirstMatchingTagText(xml, [
      "langFolderName",
      "languageFolderName",
    ]);
    const normalizedFolderName = normalizeLanguageFolderName(folderName);

    if (!folderName || !normalizedFolderName) {
      return createUnknownGameLanguage();
    }

    return {
      folderName,
      normalizedFolderName,
      source: "prefs",
    } satisfies CurrentGameLanguage;
  } catch {
    return createUnknownGameLanguage();
  }
}

export async function readModLocalizationSnapshot(args: {
  activePackageIds: string[];
  configPath: string | null;
  entries: ModSourceSnapshotEntry[];
  gameVersion: string | null;
  onProgress?: (progress: ModLocalizationAnalysisProgress) => void;
  scannedAt: string;
  toReadablePath: (windowsPath: string) => string | null;
}): Promise<ModLocalizationSnapshot> {
  const analysis = await analyzeModLocalizations(args);

  return {
    currentGameLanguage: analysis.currentGameLanguage,
    entries: analysis.entries.map((entry) => ({
      localizationStatus: entry.localizationStatus,
      modWindowsPath: entry.modWindowsPath,
    })),
    scannedAt: args.scannedAt,
  };
}

export async function analyzeModLocalizations(args: {
  activePackageIds: string[];
  configPath: string | null;
  entries: ModSourceSnapshotEntry[];
  gameVersion: string | null;
  onProgress?: (progress: ModLocalizationAnalysisProgress) => void;
  toReadablePath: (windowsPath: string) => string | null;
}) {
  const totalStart = performance.now();
  const runtime = createAnalysisRuntime();
  const progressTracker = args.onProgress
    ? new LocalizationAnalysisProgressTracker(
        args.entries.length,
        args.onProgress,
      )
    : null;
  const currentGameLanguage = await readCurrentGameLanguage({
    configPath: args.configPath,
    toReadablePath: args.toReadablePath,
  });
  progressTracker?.markCurrentLanguageResolved();
  const activePackageIds = new Set(
    args.activePackageIds.map((id) => id.toLowerCase()),
  );

  const descriptorStart = performance.now();
  const descriptors = await buildDescriptors({
    activePackageIds,
    currentGameLanguage,
    entries: args.entries,
    gameVersion: args.gameVersion,
    onDescriptorIndicesResolved: (indices) =>
      progressTracker?.markDescriptorIndicesResolved(indices),
    runtime,
  });
  modLocalizationPerfStats.descriptorBuildMs =
    performance.now() - descriptorStart;

  const activeProviders = descriptors.filter(
    (descriptor) =>
      descriptor.hasSelfTranslation &&
      descriptor.packageIdNormalized !== null &&
      activePackageIds.has(descriptor.packageIdNormalized),
  );
  const providerIndexStart = performance.now();
  const providerIndex = buildProviderIndex(activeProviders);
  modLocalizationPerfStats.providerBitmapBuildMs =
    performance.now() - providerIndexStart;
  const translatedEntryCountMemo = new Map<string, number>();

  const initialStatusStart = performance.now();
  const initialStatuses = descriptors.map((descriptor) =>
    buildLocalizationStatus({
      currentGameLanguage,
      descriptor,
      providerIndex,
      translatedEntryCountMemo,
    }),
  );
  modLocalizationPerfStats.initialStatusBuildMs =
    performance.now() - initialStatusStart;

  const descriptorsWithLazyDefs = await hydrateDescriptorsWithDefsBaselines({
    descriptors,
    initialStatuses,
    onDefsIndicesResolved: (indices) =>
      progressTracker?.markDefsIndicesResolved(indices),
    runtime,
  });
  progressTracker?.markComplete();

  const finalStatusStart = performance.now();
  const entries = descriptorsWithLazyDefs.map((descriptor) => ({
    ...descriptor.entry,
    localizationStatus: buildLocalizationStatus({
      currentGameLanguage,
      descriptor,
      providerIndex,
      translatedEntryCountMemo,
    }),
  }));
  modLocalizationPerfStats.finalStatusBuildMs =
    performance.now() - finalStatusStart;
  modLocalizationPerfStats.statusComputeMs =
    modLocalizationPerfStats.initialStatusBuildMs +
    modLocalizationPerfStats.finalStatusBuildMs;
  modLocalizationPerfStats.lastAnalyzeMs = performance.now() - totalStart;

  return {
    currentGameLanguage,
    entries,
  };
}
