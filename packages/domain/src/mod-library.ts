import type {
  ModLibraryResult,
  ModRecord,
  ModSourceSnapshot,
} from "@rimun/shared";
import { getEntryReadableWslPath, isOfficialMod, parseAboutXml } from "./xml";

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

function buildModRecord(
  entry: ModSourceSnapshot["entries"][number],
  activePackageIds: Set<string>,
): ModRecord {
  const parsedAbout = entry.aboutXmlText
    ? parseAboutXml(entry.aboutXmlText)
    : null;

  return {
    id: `${entry.source}:${parsedAbout?.packageId ?? entry.entryName}`,
    name: parsedAbout?.name ?? entry.entryName,
    packageId: parsedAbout?.packageId ?? null,
    author: parsedAbout?.author ?? null,
    version: parsedAbout?.version ?? null,
    description: parsedAbout?.description ?? null,
    source: entry.source,
    windowsPath: entry.modWindowsPath,
    wslPath: getEntryReadableWslPath(entry),
    manifestPath: entry.manifestPath,
    enabled: parsedAbout?.packageId
      ? activePackageIds.has(parsedAbout.packageId.toLowerCase())
      : false,
    isOfficial: isOfficialMod(entry.source, parsedAbout?.packageId ?? null),
    hasAboutXml: entry.hasAboutXml,
    dependencyMetadata:
      parsedAbout?.dependencyMetadata ?? createEmptyDependencyMetadata(),
    localizationStatus: entry.localizationStatus,
    notes: entry.notes,
  };
}

export function buildModLibraryFromSnapshot(
  snapshot: ModSourceSnapshot,
): ModLibraryResult {
  const activePackageIds = new Set(
    snapshot.activePackageIds.map((packageId) => packageId.toLowerCase()),
  );
  const mods = snapshot.entries
    .map((entry) => buildModRecord(entry, activePackageIds))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    environment: snapshot.environment,
    selection: snapshot.selection,
    scannedAt: snapshot.scannedAt,
    scannedRoots: snapshot.scannedRoots,
    gameVersion: snapshot.gameVersion,
    currentGameLanguage: snapshot.currentGameLanguage,
    activePackageIds: snapshot.activePackageIds,
    mods,
    errors: snapshot.errors,
    requiresConfiguration: snapshot.requiresConfiguration,
  };
}
