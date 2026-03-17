import type {
  ModDependencyMetadata,
  ModLibraryResult,
  ModManifestMetadata,
  ModRecord,
  ModSourceSnapshot,
} from "@rimun/shared";
import { getEntryReadableWslPath, isOfficialMod, parseAboutXml } from "./xml";

export function createEmptyDependencyMetadata(): ModDependencyMetadata {
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

export function createManifestMetadata(args: {
  aboutXmlText: string | null | undefined;
  entryName: string;
}): ModManifestMetadata {
  const parsedAbout = args.aboutXmlText
    ? parseAboutXml(args.aboutXmlText)
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

function buildModRecord(
  entry: ModSourceSnapshot["entries"][number],
  activePackageIds: Set<string>,
): ModRecord {
  const manifestMetadata =
    entry.manifestMetadata ??
    createManifestMetadata({
      aboutXmlText: entry.aboutXmlText,
      entryName: entry.entryName,
    });

  return {
    id: `${entry.source}:${manifestMetadata.packageId ?? entry.entryName}`,
    name: manifestMetadata.name,
    packageId: manifestMetadata.packageId,
    author: manifestMetadata.author,
    version: manifestMetadata.version,
    description: manifestMetadata.description,
    source: entry.source,
    windowsPath: entry.modWindowsPath,
    wslPath: getEntryReadableWslPath(entry),
    manifestPath: entry.manifestPath,
    enabled: manifestMetadata.packageId
      ? activePackageIds.has(manifestMetadata.packageId.toLowerCase())
      : false,
    isOfficial: isOfficialMod(entry.source, manifestMetadata.packageId),
    hasAboutXml: entry.hasAboutXml,
    dependencyMetadata: manifestMetadata.dependencyMetadata,
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
