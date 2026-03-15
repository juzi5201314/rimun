import enUsRaw from "@/shared/i18n/locales/en-us.toml?raw";
import zhCnRaw from "@/shared/i18n/locales/zh-cn.toml?raw";
import type {
  AppSettings,
  ApplyActivePackageIdsInput,
  BootstrapPayload,
  CreateProfileInput,
  DetectPathsInput,
  DetectPathsResult,
  I18nDictionariesPayload,
  LlmSettings,
  ModProfileSummary,
  ModSourceSnapshot,
  ProfileCatalogResult,
  RimunHostApi,
  SaveLlmSettingsInput,
  SaveProfileInput,
  SaveProfileResult,
  SaveSettingsInput,
  SaveSettingsResult,
  SearchModelMetadataInput,
  SearchModelMetadataResult,
  ValidatePathInput,
  ValidatePathResult,
} from "@rimun/shared";
import * as toml from "@iarna/toml";

function parseTomlDictionary(payload: string) {
  const parsed = toml.parse(payload);

  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  return parsed as Record<string, unknown>;
}

const defaultSettings: AppSettings = {
  channel: "steam",
  installationPath:
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
  workshopPath:
    "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
  configPath:
    "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
  updatedAt: "2026-03-12T00:00:00.000Z",
};

const defaultInstallationPath =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld";
const defaultWorkshopPath =
  "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100";
const defaultConfigPath =
  "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config";

const defaultDetectPaths: DetectPathsResult = {
  environment: {
    platform: "linux",
    isWsl: true,
    wslDistro: "Ubuntu",
  },
  candidates: [
    {
      kind: "installation",
      channel: "steam",
      source: "auto",
      windowsPath: defaultInstallationPath,
      wslPath: "/mnt/c/Program Files (x86)/Steam/steamapps/common/RimWorld",
      exists: true,
      readable: true,
      confidence: 0.9,
      notes: [],
    },
    {
      kind: "workshop",
      channel: "steam",
      source: "auto",
      windowsPath: defaultWorkshopPath,
      wslPath:
        "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100",
      exists: true,
      readable: true,
      confidence: 0.8,
      notes: [],
    },
    {
      kind: "config",
      channel: "steam",
      source: "auto",
      windowsPath: defaultConfigPath,
      wslPath:
        "/mnt/c/Users/player/AppData/LocalLow/Ludeon Studios/RimWorld by Ludeon Studios/Config",
      exists: true,
      readable: true,
      confidence: 0.7,
      notes: [],
    },
  ],
  preferredSelection: {
    channel: "steam",
    installationPath: defaultSettings.installationPath,
    workshopPath: defaultSettings.workshopPath,
    configPath: defaultSettings.configPath,
  },
  errors: [],
  requiresManualSelection: false,
};

const defaultBootstrap: BootstrapPayload = {
  environment: {
    platform: "linux",
    isWsl: true,
    wslDistro: "Ubuntu",
  },
  settings: defaultSettings,
  supportedChannels: ["steam", "manual"],
  preferredSelection: defaultDetectPaths.preferredSelection,
};

const defaultI18nDictionaries: I18nDictionariesPayload = {
  "en-us": parseTomlDictionary(enUsRaw),
  "zh-cn": parseTomlDictionary(zhCnRaw),
};

const defaultLlmSettings: LlmSettings = {
  providers: [],
  updatedAt: null,
};

const baseEntries: ModSourceSnapshot["entries"] = [
  {
    entryName: "Core",
    source: "installation",
    modWindowsPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods\\Core",
    modReadablePath:
      "/mnt/c/Program Files (x86)/Steam/steamapps/common/RimWorld/Mods/Core",
    manifestPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods\\Core\\About\\About.xml",
    hasAboutXml: true,
    aboutXmlText: `
      <ModMetaData>
        <name>Core</name>
        <packageId>ludeon.rimworld</packageId>
        <author>Ludeon Studios</author>
        <modVersion>1.5.4062</modVersion>
        <description>Core game systems.</description>
      </ModMetaData>
    `,
    notes: [],
  },
  {
    entryName: "818773962",
    source: "workshop",
    modWindowsPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\818773962",
    modReadablePath:
      "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/818773962",
    manifestPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\818773962\\About\\About.xml",
    hasAboutXml: true,
    aboutXmlText: `
      <ModMetaData>
        <name>HugsLib</name>
        <packageId>unlimitedhugs.hugslib</packageId>
        <author>UnlimitedHugs</author>
        <supportedVersions><li>1.5</li></supportedVersions>
        <description>Library helpers for many community mods.</description>
      </ModMetaData>
    `,
    notes: [],
  },
  {
    entryName: "999999999",
    source: "workshop",
    modWindowsPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\999999999",
    modReadablePath:
      "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/999999999",
    manifestPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\999999999\\About\\About.xml",
    hasAboutXml: true,
    aboutXmlText: `
      <ModMetaData>
        <name>Pawns</name>
        <packageId>example.pawns</packageId>
        <author>Storyteller</author>
        <supportedVersions><li>1.5</li></supportedVersions>
        <modDependencies><li>unlimitedhugs.hugslib</li></modDependencies>
        <description>A content pack that depends on HugsLib.</description>
      </ModMetaData>
    `,
    notes: [],
  },
];

const defaultProfiles: ModProfileSummary[] = [
  {
    id: "default",
    name: "Default",
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-12T00:00:00.000Z",
  },
  {
    id: "builder",
    name: "Builder",
    createdAt: "2026-03-12T00:05:00.000Z",
    updatedAt: "2026-03-12T00:05:00.000Z",
  },
];

const defaultProfileCatalog: ProfileCatalogResult = {
  currentProfileId: "default",
  profiles: defaultProfiles,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createSnapshot(activePackageIds: string[]): ModSourceSnapshot {
  return {
    environment: defaultBootstrap.environment,
    selection: defaultBootstrap.preferredSelection,
    scannedAt: "2026-03-12T00:00:00.000Z",
    scannedRoots: {
      installationModsPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      modsConfigPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
    },
    activePackageIds,
    entries: clone(baseEntries),
    errors: [],
    requiresConfiguration: false,
  };
}

type Overrides = Partial<{
  bootstrap: BootstrapPayload;
  i18nDictionaries: I18nDictionariesPayload;
  settings: AppSettings;
  llmSettings: LlmSettings;
  detectPaths: DetectPathsResult;
  profileCatalog: ProfileCatalogResult;
  modSourceSnapshotsByProfile: Record<string, ModSourceSnapshot>;
  modSourceSnapshot: ModSourceSnapshot;
  onGetI18nDictionaries: () =>
    | I18nDictionariesPayload
    | Promise<I18nDictionariesPayload>;
  onDetectPaths: (
    input: DetectPathsInput,
  ) => DetectPathsResult | Promise<DetectPathsResult>;
  onSaveProfile: (
    input: SaveProfileInput,
  ) => SaveProfileResult | Promise<SaveProfileResult>;
  onSave: (
    input: SaveSettingsInput,
  ) => SaveSettingsResult | Promise<SaveSettingsResult>;
  onSaveLlmSettings: (
    input: SaveLlmSettingsInput,
  ) => LlmSettings | Promise<LlmSettings>;
  onSearchModelMetadata: (
    input: SearchModelMetadataInput,
  ) => SearchModelMetadataResult | Promise<SearchModelMetadataResult>;
  onValidatePath: (
    input: ValidatePathInput,
  ) => ValidatePathResult | Promise<ValidatePathResult>;
  onApplyActivePackageIds: (
    input: ApplyActivePackageIdsInput,
  ) => SaveProfileResult | Promise<SaveProfileResult>;
  onGetModSourceSnapshot: (input: { profileId: string }) =>
    | ModSourceSnapshot
    | Promise<ModSourceSnapshot>;
}>;

export function createTestHostApi(overrides: Overrides = {}): RimunHostApi {
  const profileCatalogState = clone(
    overrides.profileCatalog ?? defaultProfileCatalog,
  );
  const modSourceSnapshotsByProfile: Record<string, ModSourceSnapshot> = {
    default: clone(
      overrides.modSourceSnapshot ??
        createSnapshot(["ludeon.rimworld", "unlimitedhugs.hugslib"]),
    ),
    builder: createSnapshot(["ludeon.rimworld", "example.pawns"]),
    ...clone(overrides.modSourceSnapshotsByProfile ?? {}),
  };

  function getProfileSummary(profileId: string) {
    const profile = profileCatalogState.profiles.find(
      (entry) => entry.id === profileId,
    );

    if (!profile) {
      throw new Error(`Unknown profile ${profileId}`);
    }

    return profile;
  }

  function setProfileSummary(summary: ModProfileSummary) {
    const index = profileCatalogState.profiles.findIndex(
      (profile) => profile.id === summary.id,
    );

    if (index >= 0) {
      profileCatalogState.profiles[index] = summary;
      return;
    }

    profileCatalogState.profiles.push(summary);
  }

  function setSnapshot(profileId: string, snapshot: ModSourceSnapshot) {
    modSourceSnapshotsByProfile[profileId] = clone(snapshot);
  }

  function createCatalog() {
    return clone(profileCatalogState);
  }

  return {
    getBootstrap: async () => clone(overrides.bootstrap ?? defaultBootstrap),
    getI18nDictionaries: async () => {
      if (overrides.onGetI18nDictionaries) {
        return overrides.onGetI18nDictionaries();
      }

      return clone(overrides.i18nDictionaries ?? defaultI18nDictionaries);
    },
    getProfileCatalog: async () => createCatalog(),
    createProfile: async (input: CreateProfileInput) => {
      const sourceProfile = getProfileSummary(input.sourceProfileId);
      const newProfile: ModProfileSummary = {
        id: `profile-${profileCatalogState.profiles.length + 1}`,
        name: input.name,
        createdAt: "2026-03-13T00:00:00.000Z",
        updatedAt: "2026-03-13T00:00:00.000Z",
      };

      setProfileSummary(newProfile);
      setSnapshot(
        newProfile.id,
        clone(
          modSourceSnapshotsByProfile[sourceProfile.id] ?? createSnapshot([]),
        ),
      );

      return createCatalog();
    },
    renameProfile: async (input) => {
      const profile = getProfileSummary(input.profileId);
      setProfileSummary({
        ...profile,
        name: input.name,
        updatedAt: "2026-03-13T00:10:00.000Z",
      });

      return createCatalog();
    },
    saveProfile: async (input) => {
      if (overrides.onSaveProfile) {
        return overrides.onSaveProfile(input);
      }

      const currentProfile = getProfileSummary(input.profileId);
      const profile = {
        ...currentProfile,
        name: input.name,
        updatedAt: "2026-03-13T00:15:00.000Z",
      };

      setProfileSummary(profile);
      setSnapshot(input.profileId, {
        ...(modSourceSnapshotsByProfile[input.profileId] ?? createSnapshot([])),
        activePackageIds: [...input.activePackageIds],
        scannedAt: "2026-03-13T00:15:00.000Z",
      });

      return profile;
    },
    deleteProfile: async (input) => {
      if (profileCatalogState.profiles.length <= 1) {
        throw new Error("Cannot delete the last mod profile.");
      }

      profileCatalogState.profiles = profileCatalogState.profiles.filter(
        (profile) => profile.id !== input.profileId,
      );
      delete modSourceSnapshotsByProfile[input.profileId];

      if (profileCatalogState.currentProfileId === input.profileId) {
        profileCatalogState.currentProfileId =
          profileCatalogState.profiles[0]?.id ?? "default";
      }

      return createCatalog();
    },
    switchProfile: async (input) => {
      getProfileSummary(input.profileId);
      profileCatalogState.currentProfileId = input.profileId;
      return createCatalog();
    },
    getModSourceSnapshot: async ({ profileId }) => {
      if (overrides.onGetModSourceSnapshot) {
        return clone(await overrides.onGetModSourceSnapshot({ profileId }));
      }

      return clone(
        modSourceSnapshotsByProfile[profileId] ?? createSnapshot([]),
      );
    },
    getSettings: async () => clone(overrides.settings ?? defaultSettings),
    saveSettings: async (input) => {
      if (overrides.onSave) {
        return overrides.onSave(input);
      }

      return {
        settings: {
          ...input,
          updatedAt: defaultSettings.updatedAt,
        },
        validation: [],
      };
    },
    getLlmSettings: async () =>
      clone(overrides.llmSettings ?? defaultLlmSettings),
    saveLlmSettings: async (input) => {
      if (overrides.onSaveLlmSettings) {
        return overrides.onSaveLlmSettings(input);
      }

      return {
        providers: clone(input.providers),
        updatedAt: "2026-03-13T01:00:00.000Z",
      };
    },
    searchModelMetadata: async (input) => {
      if (overrides.onSearchModelMetadata) {
        return overrides.onSearchModelMetadata(input);
      }

      return {
        query: input.modelId,
        cachedAt: "2026-03-13T01:05:00.000Z",
        matches: [],
      };
    },
    detectPaths: async (input) => {
      if (overrides.onDetectPaths) {
        return overrides.onDetectPaths(input);
      }

      return clone(overrides.detectPaths ?? defaultDetectPaths);
    },
    validatePath: async (input) => {
      if (overrides.onValidatePath) {
        return overrides.onValidatePath(input);
      }

      return {
        kind: input.kind,
        channel: input.channel,
        windowsPath: input.windowsPath,
        wslPath: "/mnt/c/mock-path",
        exists: true,
        readable: true,
        issues: [],
      };
    },
    applyActivePackageIds: async (input) => {
      if (overrides.onApplyActivePackageIds) {
        return overrides.onApplyActivePackageIds(input);
      }

      const profile = getProfileSummary(input.profileId);
      const nextProfile = {
        ...profile,
        updatedAt: "2026-03-13T00:20:00.000Z",
      };

      setProfileSummary(nextProfile);
      setSnapshot(input.profileId, {
        ...(modSourceSnapshotsByProfile[input.profileId] ?? createSnapshot([])),
        activePackageIds: [...input.activePackageIds],
        scannedAt: "2026-03-13T00:20:00.000Z",
      });

      return nextProfile;
    },
  };
}
