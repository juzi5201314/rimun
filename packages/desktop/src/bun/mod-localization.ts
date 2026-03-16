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
  collectDefInjectedIdsFromXml,
  collectDefsBaselineIdsFromXml,
  collectKeyedIdsFromXml,
  extractFirstMatchingTagText,
  getXmlRecoveryStatsForTests,
  resetXmlRecoveryStatsForTests,
} from "./mod-localization/parser";

type TranslationBucket = "defInjected" | "keyed" | "strings";

type TranslationEntrySets = Record<TranslationBucket, Set<string>>;

type LanguageContribution = {
  hasAnyLanguagesRoot: boolean;
  matchedFolderName: string | null;
  entries: TranslationEntrySets;
};

type ModLocalizationDescriptor = {
  baselineEntries: TranslationEntrySets;
  currentLanguageContribution: LanguageContribution;
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

type CachedDescriptorArtifacts = {
  baselineEntries: TranslationEntrySets;
  currentLanguageContribution: LanguageContribution;
  fingerprint: string;
  hasSelfTranslation: boolean;
};

type CachedDefsBaseline = {
  fingerprint: string;
  ids: Set<string>;
};

type AnalysisRuntime = {
  descriptorConcurrency: number;
  descriptorLimit: ReturnType<typeof pLimit>;
  fileConcurrency: number;
  fileLimit: ReturnType<typeof pLimit>;
};

type ProviderIndex = {
  byDependencyTarget: Map<string, Set<string>>;
  byTranslationId: Record<TranslationBucket, Map<string, Set<string>>>;
  providersByPackageId: Map<string, ModLocalizationDescriptor>;
};

export type ModLocalizationAnalysisProgress = {
  completedUnits: number;
  percent: number;
  totalUnits: number;
};

export type ModLocalizationPerfStats = {
  defsCacheHits: number;
  defsCacheMisses: number;
  descriptorBuildMs: number;
  descriptorCacheHits: number;
  descriptorCacheMisses: number;
  descriptorConcurrency: number;
  fileConcurrency: number;
  finalStatusBuildMs: number;
  initialStatusBuildMs: number;
  lastAnalyzeMs: number;
  recoveredFiles: number;
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

const MAX_LOCALIZATION_DESCRIPTOR_CONCURRENCY = 8;
const MAX_LOCALIZATION_FILE_CONCURRENCY = 32;

const descriptorArtifactsCache = new Map<string, CachedDescriptorArtifacts>();
const defsBaselineCache = new Map<string, CachedDefsBaseline>();

const modLocalizationPerfStats: ModLocalizationPerfStats = {
  defsCacheHits: 0,
  defsCacheMisses: 0,
  descriptorBuildMs: 0,
  descriptorCacheHits: 0,
  descriptorCacheMisses: 0,
  descriptorConcurrency: 0,
  fileConcurrency: 0,
  finalStatusBuildMs: 0,
  initialStatusBuildMs: 0,
  lastAnalyzeMs: 0,
  recoveredFiles: 0,
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
  return {
    defInjected: new Set<string>(),
    keyed: new Set<string>(),
    strings: new Set<string>(),
  };
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
        const fileStats = await stat(absolutePath);
        const relativePath = normalizePathForId(
          relative(args.rootPath, absolutePath),
        );
        const fingerprintToken = `${relativePath}:${fileStats.size}:${Math.trunc(fileStats.mtimeMs)}`;

        return {
          absolutePath,
          fingerprintToken,
          relativePath,
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

function unionInto(target: Set<string>, source: Set<string>) {
  source.forEach((id) => target.add(id));
}

function countEntries(entries: TranslationEntrySets) {
  return TRANSLATION_BUCKETS.reduce(
    (count, bucket) => count + entries[bucket].size,
    0,
  );
}

function hasAnyEntries(entries: TranslationEntrySets) {
  return countEntries(entries) > 0;
}

function createDefInjectedBaselineEntries(defInjectedIds: Set<string>) {
  return {
    defInjected: defInjectedIds,
    keyed: new Set<string>(),
    strings: new Set<string>(),
  } satisfies TranslationEntrySets;
}

function mergeTranslationEntries(
  left: TranslationEntrySets,
  right: TranslationEntrySets,
) {
  const merged = createEmptyTranslationEntrySets();

  for (const bucket of TRANSLATION_BUCKETS) {
    unionInto(merged[bucket], left[bucket]);
    unionInto(merged[bucket], right[bucket]);
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
  const entries = createEmptyTranslationEntrySets();

  await Promise.all([
    ...args.inventory.keyed.map((file) =>
      args.runtime.fileLimit(async () => {
        try {
          const xml = await readDecodedXmlFile(file.absolutePath);
          unionInto(
            entries.keyed,
            collectKeyedIdsFromXml(xml, file.relativePath),
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

          unionInto(
            entries.defInjected,
            collectDefInjectedIdsFromXml(xml, defType),
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
        unionInto(
          entries.strings,
          collectStringsIdsFromText(text, file.relativePath),
        );
      }),
    ),
  ]);

  return entries;
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

async function buildDescriptorFromCache(args: {
  currentGameLanguage: CurrentGameLanguage;
  entry: ModSourceSnapshotEntry;
  metadata: ReturnType<typeof collectDependencyTargets>;
  relativeRoots: string[];
  runtime: AnalysisRuntime;
}) {
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
      baselineEntries: cached.baselineEntries,
      currentLanguageContribution: cached.currentLanguageContribution,
      dependencyTargets: args.metadata.dependencyTargets,
      entry: args.entry,
      hasSelfTranslation: cached.hasSelfTranslation,
      packageIdNormalized: args.metadata.packageIdNormalized,
      relativeRoots: args.relativeRoots,
    } satisfies ModLocalizationDescriptor;
  }

  modLocalizationPerfStats.descriptorCacheMisses += 1;
  const baselineEntries = await parseBucketedLocalizationEntries({
    inventory: languageInventory.english,
    runtime: args.runtime,
  });
  const currentEntries =
    languageInventory.current.fingerprint ===
    languageInventory.english.fingerprint
      ? baselineEntries
      : await parseBucketedLocalizationEntries({
          inventory: languageInventory.current,
          runtime: args.runtime,
        });
  const currentLanguageContribution = {
    entries: currentEntries,
    hasAnyLanguagesRoot: languageInventory.hasAnyLanguagesRoot,
    matchedFolderName: languageInventory.matchedFolderName,
  } satisfies LanguageContribution;
  const hasSelfTranslation = hasAnyEntries(currentEntries);

  descriptorArtifactsCache.set(cacheKey, {
    baselineEntries,
    currentLanguageContribution,
    fingerprint: languageInventory.fingerprint,
    hasSelfTranslation,
  });

  return {
    baselineEntries,
    currentLanguageContribution,
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

async function collectDefsBaselineIdsCached(args: {
  descriptor: ModLocalizationDescriptor;
  runtime: AnalysisRuntime;
}) {
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

  modLocalizationPerfStats.defsCacheMisses += 1;
  const ids = new Set<string>();

  await Promise.all(
    inventory.files.map((file) =>
      args.runtime.fileLimit(async () => {
        try {
          const xml = await readDecodedXmlFile(file.absolutePath);
          unionInto(ids, collectDefsBaselineIdsFromXml(xml));
        } catch {
          // Ignore unrecoverable malformed files so one bad defs file
          // cannot take down the whole analysis.
        }
      }),
    ),
  );

  defsBaselineCache.set(cacheKey, {
    fingerprint: inventory.fingerprint,
    ids,
  });

  return ids;
}

function addMapSetValue<T>(map: Map<string, Set<T>>, key: string, value: T) {
  const existing = map.get(key);

  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
}

function buildProviderIndex(descriptors: ModLocalizationDescriptor[]) {
  const byDependencyTarget = new Map<string, Set<string>>();
  const byTranslationId = {
    defInjected: new Map<string, Set<string>>(),
    keyed: new Map<string, Set<string>>(),
    strings: new Map<string, Set<string>>(),
  } satisfies Record<TranslationBucket, Map<string, Set<string>>>;
  const providersByPackageId = new Map<string, ModLocalizationDescriptor>();

  for (const descriptor of descriptors) {
    const packageId = descriptor.packageIdNormalized;

    if (!packageId) {
      continue;
    }

    providersByPackageId.set(packageId, descriptor);

    for (const targetPackageId of descriptor.dependencyTargets) {
      addMapSetValue(byDependencyTarget, targetPackageId, packageId);
    }

    for (const bucket of TRANSLATION_BUCKETS) {
      for (const translationId of descriptor.currentLanguageContribution
        .entries[bucket]) {
        addMapSetValue(byTranslationId[bucket], translationId, packageId);
      }
    }
  }

  return {
    byDependencyTarget,
    byTranslationId,
    providersByPackageId,
  } satisfies ProviderIndex;
}

function collectCandidateProviderIds(args: {
  descriptor: ModLocalizationDescriptor;
  providerIndex: ProviderIndex;
}) {
  const candidateProviderIds = new Set<string>();

  if (args.descriptor.packageIdNormalized) {
    const dependencyProviders = args.providerIndex.byDependencyTarget.get(
      args.descriptor.packageIdNormalized,
    );

    dependencyProviders?.forEach((packageId) =>
      candidateProviderIds.add(packageId),
    );
  }

  for (const bucket of TRANSLATION_BUCKETS) {
    for (const translationId of args.descriptor.baselineEntries[bucket]) {
      const overlapProviders =
        args.providerIndex.byTranslationId[bucket].get(translationId);

      overlapProviders?.forEach((packageId) =>
        candidateProviderIds.add(packageId),
      );
    }
  }

  if (args.descriptor.packageIdNormalized) {
    candidateProviderIds.delete(args.descriptor.packageIdNormalized);
  }

  return candidateProviderIds;
}

function computeCoveredEntries(args: {
  baselineEntries: TranslationEntrySets;
  translatedEntries: TranslationEntrySets;
}) {
  let coveredEntries = 0;

  for (const bucket of TRANSLATION_BUCKETS) {
    for (const translationId of args.translatedEntries[bucket]) {
      if (args.baselineEntries[bucket].has(translationId)) {
        coveredEntries += 1;
      }
    }
  }

  return coveredEntries;
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
}) {
  const translatedEntries = createEmptyTranslationEntrySets();
  const providerPackageIds: string[] = [];
  let matchedFolderName: string | null =
    args.descriptor.currentLanguageContribution.matchedFolderName;

  if (args.descriptor.hasSelfTranslation) {
    for (const bucket of TRANSLATION_BUCKETS) {
      unionInto(
        translatedEntries[bucket],
        args.descriptor.currentLanguageContribution.entries[bucket],
      );
    }

    if (args.descriptor.packageIdNormalized) {
      providerPackageIds.push(args.descriptor.packageIdNormalized);
    }
  }

  for (const providerPackageId of collectCandidateProviderIds(args)) {
    const provider =
      args.providerIndex.providersByPackageId.get(providerPackageId);

    if (!provider) {
      continue;
    }

    providerPackageIds.push(providerPackageId);
    matchedFolderName ??=
      provider.currentLanguageContribution.matchedFolderName;

    for (const bucket of TRANSLATION_BUCKETS) {
      unionInto(
        translatedEntries[bucket],
        provider.currentLanguageContribution.entries[bucket],
      );
    }
  }

  const translatedEntryCount = countEntries(translatedEntries);
  const baselineEntryCount = countEntries(args.descriptor.baselineEntries);

  if (translatedEntryCount > 0) {
    return {
      kind: "translated",
      isSupported: true,
      matchedFolderName,
      providerPackageIds: [...new Set(providerPackageIds)],
      coverage: buildCoverage({
        coveredEntries: computeCoveredEntries({
          baselineEntries: args.descriptor.baselineEntries,
          translatedEntries,
        }),
        totalEntries: baselineEntryCount,
        translatedEntryCount,
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

  return Promise.all(
    args.entries.map((entry, index) =>
      args.runtime.descriptorLimit(async () => {
        const descriptor = await buildDescriptorFromCache({
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

        args.onDescriptorIndicesResolved?.([index]);
        return descriptor;
      }),
    ),
  );
}

async function hydrateDescriptorsWithDefsBaselines(args: {
  descriptors: ModLocalizationDescriptor[];
  initialStatuses: ModLocalizationStatus[];
  onDefsIndicesResolved?: (indices: number[]) => void;
  runtime: AnalysisRuntime;
}) {
  const pendingIndicesByPath = new Map<string, number[]>();
  const skippedIndices: number[] = [];

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
      pendingIndicesByPath.get(descriptor.entry.modReadablePath) ?? [];
    existingIndices.push(index);
    pendingIndicesByPath.set(descriptor.entry.modReadablePath, existingIndices);
  }

  if (skippedIndices.length > 0) {
    args.onDefsIndicesResolved?.(skippedIndices);
  }

  if (pendingIndicesByPath.size === 0) {
    return args.descriptors;
  }

  const defsBaselineByPath = new Map<string, Set<string>>();

  await Promise.all(
    [...pendingIndicesByPath.entries()].map(([modReadablePath, indices]) =>
      args.runtime.descriptorLimit(async () => {
        const descriptor = args.descriptors[indices[0] ?? -1];

        if (!descriptor) {
          return;
        }

        defsBaselineByPath.set(
          modReadablePath,
          await collectDefsBaselineIdsCached({
            descriptor,
            runtime: args.runtime,
          }),
        );
        args.onDefsIndicesResolved?.(indices);
      }),
    ),
  );

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

    if (!defsBaselineEntries || defsBaselineEntries.size === 0) {
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
  modLocalizationPerfStats.defsCacheHits = 0;
  modLocalizationPerfStats.defsCacheMisses = 0;
  modLocalizationPerfStats.descriptorBuildMs = 0;
  modLocalizationPerfStats.descriptorCacheHits = 0;
  modLocalizationPerfStats.descriptorCacheMisses = 0;
  modLocalizationPerfStats.descriptorConcurrency = 0;
  modLocalizationPerfStats.fileConcurrency = 0;
  modLocalizationPerfStats.finalStatusBuildMs = 0;
  modLocalizationPerfStats.initialStatusBuildMs = 0;
  modLocalizationPerfStats.lastAnalyzeMs = 0;
  modLocalizationPerfStats.recoveredFiles = 0;
  modLocalizationPerfStats.strictParseFailures = 0;
  modLocalizationPerfStats.unrecoverableFiles = 0;
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
  const providerIndex = buildProviderIndex(activeProviders);

  const initialStatusStart = performance.now();
  const initialStatuses = descriptors.map((descriptor) =>
    buildLocalizationStatus({
      currentGameLanguage,
      descriptor,
      providerIndex,
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
    }),
  }));
  modLocalizationPerfStats.finalStatusBuildMs =
    performance.now() - finalStatusStart;
  modLocalizationPerfStats.lastAnalyzeMs = performance.now() - totalStart;

  return {
    currentGameLanguage,
    entries,
  };
}
