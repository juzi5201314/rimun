import type { RimunRpcClient } from "@/shared/bridge/rpcClient";
import type {
  AppSettings,
  ApplyModOrderRecommendationInput,
  BootstrapPayload,
  DetectPathsInput,
  DetectPathsResult,
  ModLibraryResult,
  ModOrderAnalysisResult,
  ModOrderApplyResult,
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

const defaultModLibrary: ModLibraryResult = {
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
  activePackageIds: ["ludeon.rimworld", "unlimitedhugs.hugslib"],
  mods: [
    {
      id: "installation:ludeon.rimworld",
      name: "Core",
      packageId: "ludeon.rimworld",
      author: "Ludeon Studios",
      version: "1.5.4062",
      description: "Core game systems.\n\n- Pawns\n- Factions\n- Incidents",
      source: "installation",
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
      source: "workshop",
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
      source: "workshop",
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
  ],
  errors: [],
  requiresConfiguration: false,
};

const defaultModOrderAnalysis: ModOrderAnalysisResult = {
  analyzedAt: "2026-03-12T00:00:01.000Z",
  currentActivePackageIds: ["ludeon.rimworld", "unlimitedhugs.hugslib"],
  recommendedActivePackageIds: ["ludeon.rimworld", "unlimitedhugs.hugslib"],
  recommendedOrderPackageIds: ["ludeon.rimworld", "unlimitedhugs.hugslib"],
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
};

type Overrides = Partial<{
  bootstrap: BootstrapPayload;
  modLibrary: ModLibraryResult;
  modOrderAnalysis: ModOrderAnalysisResult;
  settings: AppSettings;
  detectPaths: DetectPathsResult;
  onDetectPaths: (
    input: DetectPathsInput,
  ) => DetectPathsResult | Promise<DetectPathsResult>;
  onAnalyzeModOrder: () =>
    | ModOrderAnalysisResult
    | Promise<ModOrderAnalysisResult>;
  onApplyModOrderRecommendation: (
    input: ApplyModOrderRecommendationInput,
  ) => ModOrderApplyResult | Promise<ModOrderApplyResult>;
  onSave: (
    input: SaveSettingsInput,
  ) => SaveSettingsResult | Promise<SaveSettingsResult>;
  onValidatePath: (
    input: ValidatePathInput,
  ) => ValidatePathResult | Promise<ValidatePathResult>;
}>;

export function createMockRpcClient(overrides: Overrides = {}): RimunRpcClient {
  return {
    getBootstrap: async () => overrides.bootstrap ?? defaultBootstrap,
    getModLibrary: async () => overrides.modLibrary ?? defaultModLibrary,
    analyzeModOrder: async () => {
      if (overrides.onAnalyzeModOrder) {
        return overrides.onAnalyzeModOrder();
      }

      return overrides.modOrderAnalysis ?? defaultModOrderAnalysis;
    },
    applyModOrderRecommendation: async (input) => {
      if (overrides.onApplyModOrderRecommendation) {
        return overrides.onApplyModOrderRecommendation(input);
      }

      return {
        appliedActions: input.actions,
        activePackageIds:
          input.actions.includes("enableMissingDependencies") ||
          input.actions.includes("reorderActiveMods")
            ? defaultModOrderAnalysis.recommendedOrderPackageIds
            : defaultModLibrary.activePackageIds,
        modLibrary: overrides.modLibrary ?? defaultModLibrary,
        analysis: overrides.modOrderAnalysis ?? defaultModOrderAnalysis,
      };
    },
    getSettings: async () => overrides.settings ?? defaultSettings,
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

      return overrides.detectPaths ?? defaultDetectPaths;
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
