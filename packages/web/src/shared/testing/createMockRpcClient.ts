import type { RimunRpcClient } from "@/shared/bridge/rpcClient";
import type {
  AppSettings,
  BootstrapPayload,
  DetectPathsResult,
  SaveSettingsInput,
  SaveSettingsResult,
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

type Overrides = Partial<{
  bootstrap: BootstrapPayload;
  settings: AppSettings;
  detectPaths: DetectPathsResult;
  onSave: (
    input: SaveSettingsInput,
  ) => SaveSettingsResult | Promise<SaveSettingsResult>;
}>;

export function createMockRpcClient(overrides: Overrides = {}): RimunRpcClient {
  return {
    getBootstrap: async () => overrides.bootstrap ?? defaultBootstrap,
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
    detectPaths: async () => overrides.detectPaths ?? defaultDetectPaths,
  };
}
