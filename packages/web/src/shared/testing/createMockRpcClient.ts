import type { RimunRpcClient } from "@/shared/bridge/rpcClient";
import type {
  AppSettings,
  BootstrapPayload,
  DetectPathsInput,
  DetectPathsResult,
  ModLibraryResult,
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
  mods: [
    {
      id: "installation:ludeon.rimworld",
      name: "Core",
      packageId: "ludeon.rimworld",
      author: "Ludeon Studios",
      version: "1.5.4062",
      description:
        "Core game systems.\n\n- Pawns\n- Factions\n- Incidents",
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
      notes: [],
    },
  ],
  errors: [],
  requiresConfiguration: false,
};

type Overrides = Partial<{
  bootstrap: BootstrapPayload;
  modLibrary: ModLibraryResult;
  settings: AppSettings;
  detectPaths: DetectPathsResult;
  onDetectPaths: (
    input: DetectPathsInput,
  ) => DetectPathsResult | Promise<DetectPathsResult>;
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
