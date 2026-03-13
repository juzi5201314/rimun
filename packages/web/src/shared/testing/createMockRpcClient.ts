import type { RimunRpcClient } from "@/shared/bridge/rpcClient";
import type {
  AppSettings,
  ApplyModOrderRecommendationInput,
  BootstrapPayload,
  CreateProfileInput,
  DetectPathsInput,
  DetectPathsResult,
  ModLibraryResult,
  ModOrderAnalysisResult,
  ModOrderApplyResult,
  ModProfileSummary,
  ProfileCatalogResult,
  SaveProfileInput,
  SaveProfileResult,
  SaveSettingsInput,
  SaveSettingsResult,
  ValidatePathInput,
  ValidatePathResult,
} from "@rimun/shared";

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
      windowsPath:
        defaultSettings.installationPath ??
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
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
      windowsPath:
        defaultSettings.workshopPath ??
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
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
      windowsPath:
        defaultSettings.configPath ??
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
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

function createDependencyMetadata(packageId: string | null) {
  return {
    packageIdNormalized: packageId,
    dependencies: [],
    loadAfter: [],
    loadBefore: [],
    forceLoadAfter: [],
    forceLoadBefore: [],
    incompatibleWith: [],
    supportedVersions: [],
  };
}

const baseMods = [
  {
    id: "installation:ludeon.rimworld",
    name: "Core",
    packageId: "ludeon.rimworld",
    author: "Ludeon Studios",
    version: "1.5.4062",
    description: "Core game systems.\n\n- Pawns\n- Factions\n- Incidents",
    source: "installation" as const,
    windowsPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods\\Core",
    wslPath:
      "/mnt/c/Program Files (x86)/Steam/steamapps/common/RimWorld/Mods/Core",
    manifestPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods\\Core\\About\\About.xml",
    enabled: true,
    isOfficial: true,
    hasAboutXml: true,
    dependencyMetadata: createDependencyMetadata("ludeon.rimworld"),
    notes: [],
  },
  {
    id: "workshop:unlimitedhugs.hugslib",
    name: "HugsLib",
    packageId: "unlimitedhugs.hugslib",
    author: "UnlimitedHugs",
    version: "1.5",
    description: "Library helpers for many community mods.",
    source: "workshop" as const,
    windowsPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\818773962",
    wslPath:
      "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/818773962",
    manifestPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\818773962\\About\\About.xml",
    enabled: true,
    isOfficial: false,
    hasAboutXml: true,
    dependencyMetadata: createDependencyMetadata("unlimitedhugs.hugslib"),
    notes: [],
  },
  {
    id: "workshop:example.pawns",
    name: "Pawns",
    packageId: "example.pawns",
    author: "Storyteller",
    version: "1.5",
    description: "A content pack that depends on HugsLib.",
    source: "workshop" as const,
    windowsPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\999999999",
    wslPath:
      "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/999999999",
    manifestPath:
      "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\999999999\\About\\About.xml",
    enabled: false,
    isOfficial: false,
    hasAboutXml: true,
    dependencyMetadata: {
      ...createDependencyMetadata("example.pawns"),
      dependencies: ["unlimitedhugs.hugslib"],
    },
    notes: [],
  },
] satisfies ModLibraryResult["mods"];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createModLibrary(activePackageIds: string[]): ModLibraryResult {
  const normalizedActivePackageIds = [...new Set(activePackageIds)];
  const activeSet = new Set(normalizedActivePackageIds);

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
    activePackageIds: normalizedActivePackageIds,
    mods: baseMods.map((mod) => ({
      ...clone(mod),
      enabled: mod.packageId ? activeSet.has(mod.packageId) : false,
    })),
    errors: [],
    requiresConfiguration: false,
  };
}

function createAnalysis(
  activePackageIds: string[],
  options: Partial<ModOrderAnalysisResult> = {},
): ModOrderAnalysisResult {
  return {
    analyzedAt: "2026-03-12T00:00:01.000Z",
    currentActivePackageIds: activePackageIds,
    recommendedActivePackageIds: activePackageIds,
    recommendedOrderPackageIds: activePackageIds,
    missingInstalledInactiveDependencies: [],
    missingUnavailableDependencies: [],
    diagnostics: [],
    explanations: [
      {
        packageId: "ludeon.rimworld",
        modName: "Core",
        reasons: [
          "Should load before HugsLib: Core must load before every other mod.",
        ],
      },
    ],
    edges: [
      {
        fromPackageId: "ludeon.rimworld",
        toPackageId: "unlimitedhugs.hugslib",
        kind: "official_anchor",
        source: "system",
        isHard: true,
        reason: "Core must load before every other mod.",
      },
    ],
    isOptimal: true,
    hasBlockingIssues: false,
    sortDifferenceCount: 0,
    ...options,
  };
}

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

type Overrides = Partial<{
  bootstrap: BootstrapPayload;
  settings: AppSettings;
  detectPaths: DetectPathsResult;
  profileCatalog: ProfileCatalogResult;
  modLibrariesByProfile: Record<string, ModLibraryResult>;
  modOrderAnalysisByProfile: Record<string, ModOrderAnalysisResult>;
  modLibrary: ModLibraryResult;
  modOrderAnalysis: ModOrderAnalysisResult;
  onDetectPaths: (
    input: DetectPathsInput,
  ) => DetectPathsResult | Promise<DetectPathsResult>;
  onAnalyzeModOrder: (
    profileId: string,
  ) => ModOrderAnalysisResult | Promise<ModOrderAnalysisResult>;
  onApplyModOrderRecommendation: (
    input: ApplyModOrderRecommendationInput,
  ) => ModOrderApplyResult | Promise<ModOrderApplyResult>;
  onSaveProfile: (
    input: SaveProfileInput,
  ) => SaveProfileResult | Promise<SaveProfileResult>;
  onSave: (
    input: SaveSettingsInput,
  ) => SaveSettingsResult | Promise<SaveSettingsResult>;
  onValidatePath: (
    input: ValidatePathInput,
  ) => ValidatePathResult | Promise<ValidatePathResult>;
}>;

export function createMockRpcClient(overrides: Overrides = {}): RimunRpcClient {
  const profileCatalogState = clone(
    overrides.profileCatalog ?? defaultProfileCatalog,
  );
  const modLibrariesByProfile: Record<string, ModLibraryResult> = {
    default: clone(
      overrides.modLibrary ??
        createModLibrary(["ludeon.rimworld", "unlimitedhugs.hugslib"]),
    ),
    builder: createModLibrary(["ludeon.rimworld", "example.pawns"]),
    ...clone(overrides.modLibrariesByProfile ?? {}),
  };
  const modOrderAnalysisByProfile: Record<string, ModOrderAnalysisResult> = {
    default: clone(
      overrides.modOrderAnalysis ??
        createAnalysis(["ludeon.rimworld", "unlimitedhugs.hugslib"]),
    ),
    builder: createAnalysis(["ludeon.rimworld", "example.pawns"], {
      isOptimal: false,
      recommendedActivePackageIds: [
        "ludeon.rimworld",
        "example.pawns",
        "unlimitedhugs.hugslib",
      ],
      recommendedOrderPackageIds: [
        "ludeon.rimworld",
        "unlimitedhugs.hugslib",
        "example.pawns",
      ],
      missingInstalledInactiveDependencies: [
        {
          packageId: "unlimitedhugs.hugslib",
          modName: "HugsLib",
          requiredByPackageIds: ["example.pawns"],
          requiredByNames: ["Pawns"],
        },
      ],
      sortDifferenceCount: 1,
    }),
    ...clone(overrides.modOrderAnalysisByProfile ?? {}),
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

  function setModLibrary(profileId: string, modLibrary: ModLibraryResult) {
    modLibrariesByProfile[profileId] = clone(modLibrary);
  }

  function setAnalysis(profileId: string, analysis: ModOrderAnalysisResult) {
    modOrderAnalysisByProfile[profileId] = clone(analysis);
  }

  function createCatalog() {
    return clone(profileCatalogState);
  }

  return {
    getBootstrap: async () => clone(overrides.bootstrap ?? defaultBootstrap),
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
      setModLibrary(
        newProfile.id,
        clone(modLibrariesByProfile[sourceProfile.id] ?? createModLibrary([])),
      );
      setAnalysis(
        newProfile.id,
        clone(
          modOrderAnalysisByProfile[sourceProfile.id] ?? createAnalysis([]),
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
      const modLibrary = createModLibrary(input.activePackageIds);
      const analysis =
        modOrderAnalysisByProfile[input.profileId] ??
        createAnalysis(input.activePackageIds);
      const profile = {
        ...currentProfile,
        name: input.name,
        updatedAt: "2026-03-13T00:15:00.000Z",
      };

      setProfileSummary(profile);
      setModLibrary(input.profileId, modLibrary);
      setAnalysis(input.profileId, {
        ...analysis,
        currentActivePackageIds: input.activePackageIds,
        recommendedActivePackageIds: input.activePackageIds,
        recommendedOrderPackageIds: input.activePackageIds,
        analyzedAt: "2026-03-13T00:15:00.000Z",
        sortDifferenceCount: 0,
        missingInstalledInactiveDependencies: [],
        isOptimal: true,
      });

      return {
        profile,
        modLibrary: clone(modLibrariesByProfile[input.profileId]),
        analysis: clone(modOrderAnalysisByProfile[input.profileId]),
      };
    },
    deleteProfile: async (input) => {
      if (profileCatalogState.profiles.length <= 1) {
        throw new Error("Cannot delete the last mod profile.");
      }

      profileCatalogState.profiles = profileCatalogState.profiles.filter(
        (profile) => profile.id !== input.profileId,
      );
      delete modLibrariesByProfile[input.profileId];
      delete modOrderAnalysisByProfile[input.profileId];

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
    getModLibrary: async ({ profileId }) =>
      clone(modLibrariesByProfile[profileId] ?? createModLibrary([])),
    analyzeModOrder: async ({ profileId }) => {
      if (overrides.onAnalyzeModOrder) {
        return overrides.onAnalyzeModOrder(profileId);
      }

      return clone(modOrderAnalysisByProfile[profileId] ?? createAnalysis([]));
    },
    applyModOrderRecommendation: async (
      input: ApplyModOrderRecommendationInput,
    ) => {
      if (overrides.onApplyModOrderRecommendation) {
        return overrides.onApplyModOrderRecommendation(input);
      }

      const currentModLibrary =
        modLibrariesByProfile[input.profileId] ?? createModLibrary([]);
      const currentAnalysis =
        modOrderAnalysisByProfile[input.profileId] ??
        createAnalysis(currentModLibrary.activePackageIds);
      const nextActivePackageIds = input.actions.includes("reorderActiveMods")
        ? currentAnalysis.recommendedOrderPackageIds
        : currentAnalysis.recommendedActivePackageIds;
      const nextModLibrary = createModLibrary(nextActivePackageIds);
      const nextAnalysis = {
        ...currentAnalysis,
        analyzedAt: "2026-03-13T00:20:00.000Z",
        currentActivePackageIds: nextActivePackageIds,
        recommendedActivePackageIds: nextActivePackageIds,
        recommendedOrderPackageIds: nextActivePackageIds,
        missingInstalledInactiveDependencies: [],
        sortDifferenceCount: 0,
        isOptimal: true,
      };

      setModLibrary(input.profileId, nextModLibrary);
      setAnalysis(input.profileId, nextAnalysis);

      return {
        appliedActions: input.actions,
        activePackageIds: nextActivePackageIds,
        modLibrary: clone(nextModLibrary),
        analysis: clone(nextAnalysis),
      };
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
  };
}
