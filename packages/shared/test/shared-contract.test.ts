import { describe, expect, it } from "bun:test";

import {
  bootstrapPayloadSchema,
  createProfileInputSchema,
  detectPathsResultSchema,
  llmSettingsSchema,
  modOrderAnalysisResultSchema,
  modSourceSnapshotSchema,
  profileCatalogResultSchema,
  profileScopedInputSchema,
  rimunRpcSchemas,
  saveLlmSettingsInputSchema,
  saveProfileInputSchema,
  saveProfileResultSchema,
  saveSettingsInputSchema,
  searchModelMetadataResultSchema,
  validatePathResultSchema,
} from "../src/index";

describe("shared schemas", () => {
  it("accepts a bootstrap payload with persisted settings", () => {
    const parsed = bootstrapPayloadSchema.parse({
      environment: {
        platform: "linux",
        isWsl: true,
        wslDistro: "Ubuntu",
      },
      settings: {
        channel: "steam",
        installationPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
        workshopPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
        configPath:
          "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
        updatedAt: "2026-03-12T10:00:00.000Z",
      },
      supportedChannels: ["steam", "manual"],
      preferredSelection: {
        channel: "steam",
        installationPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
        workshopPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
        configPath:
          "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      },
    });

    expect(parsed.environment.isWsl).toBe(true);
    expect(parsed.settings.channel).toBe("steam");
  });

  it("rejects non-absolute windows paths in save settings", () => {
    expect(() =>
      saveSettingsInputSchema.parse({
        channel: "steam",
        installationPath: "steamapps/common/RimWorld",
        workshopPath: null,
        configPath: null,
      }),
    ).toThrow();
  });

  it("keeps WSL and Windows path semantics explicit in validation result", () => {
    const parsed = validatePathResultSchema.parse({
      kind: "installation",
      channel: "steam",
      windowsPath: "D:\\Games\\RimWorld",
      wslPath: "/mnt/d/Games/RimWorld",
      exists: true,
      readable: true,
      issues: [],
    });

    expect(parsed.windowsPath).toBe("D:\\Games\\RimWorld");
    expect(parsed.wslPath).toBe("/mnt/d/Games/RimWorld");
  });

  it("requires manual selection when detection returns no valid candidates", () => {
    const parsed = detectPathsResultSchema.parse({
      environment: {
        platform: "windows",
        isWsl: false,
        wslDistro: null,
      },
      candidates: [],
      preferredSelection: null,
      errors: [
        {
          code: "environment_error",
          message: "No Steam installation was detected.",
          detail: null,
          recoverable: true,
        },
      ],
      requiresManualSelection: true,
    });

    expect(parsed.requiresManualSelection).toBe(true);
    expect(parsed.errors).toHaveLength(1);
  });

  it("accepts a mod source snapshot payload", () => {
    const parsed = modSourceSnapshotSchema.parse({
      environment: {
        platform: "linux",
        isWsl: true,
        wslDistro: "Ubuntu",
      },
      selection: {
        channel: "steam",
        installationPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
        workshopPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
        configPath: null,
      },
      scannedAt: "2026-03-12T10:00:00.000Z",
      scannedRoots: {
        installationModsPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods",
        workshopPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
        modsConfigPath:
          "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
      },
      activePackageIds: ["ludeon.rimworld"],
      entries: [
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
          aboutXmlText:
            "<ModMetaData><name>Core</name><packageId>ludeon.rimworld</packageId></ModMetaData>",
          notes: [],
        },
      ],
      errors: [],
      requiresConfiguration: false,
    });

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.source).toBe("installation");
    expect(parsed.activePackageIds).toEqual(["ludeon.rimworld"]);
  });

  it("accepts a profile catalog payload", () => {
    const parsed = profileCatalogResultSchema.parse({
      currentProfileId: "default",
      profiles: [
        {
          id: "default",
          name: "Default",
          createdAt: "2026-03-13T10:00:00.000Z",
          updatedAt: "2026-03-13T10:00:00.000Z",
        },
      ],
    });

    expect(parsed.currentProfileId).toBe("default");
    expect(parsed.profiles[0]?.name).toBe("Default");
  });

  it("accepts a mod order analysis payload", () => {
    const parsed = modOrderAnalysisResultSchema.parse({
      analyzedAt: "2026-03-13T10:00:00.000Z",
      currentActivePackageIds: ["ludeon.rimworld", "example.camera"],
      recommendedActivePackageIds: [
        "ludeon.rimworld",
        "example.camera",
        "unlimitedhugs.hugslib",
      ],
      recommendedOrderPackageIds: [
        "ludeon.rimworld",
        "unlimitedhugs.hugslib",
        "example.camera",
      ],
      missingInstalledInactiveDependencies: [
        {
          packageId: "unlimitedhugs.hugslib",
          modName: "HugsLib",
          requiredByPackageIds: ["example.camera"],
          requiredByNames: ["Camera+"],
        },
      ],
      missingUnavailableDependencies: [],
      diagnostics: [
        {
          code: "missing_installed_inactive_dependency",
          severity: "warning",
          message: "Camera+ requires HugsLib.",
          packageIds: ["example.camera", "unlimitedhugs.hugslib"],
          modIds: ["workshop:example.camera", "workshop:unlimitedhugs.hugslib"],
          isBlocking: false,
        },
      ],
      explanations: [
        {
          packageId: "example.camera",
          modName: "Camera+",
          reasons: ["Should load after HugsLib: Camera+ depends on HugsLib."],
        },
      ],
      edges: [
        {
          fromPackageId: "unlimitedhugs.hugslib",
          toPackageId: "example.camera",
          kind: "dependency",
          source: "about",
          isHard: true,
          reason: "Camera+ depends on HugsLib.",
        },
      ],
      isOptimal: false,
      hasBlockingIssues: false,
      sortDifferenceCount: 1,
    });

    expect(parsed.recommendedOrderPackageIds[1]).toBe("unlimitedhugs.hugslib");
  });

  it("accepts a profile-scoped request input", () => {
    const parsed = profileScopedInputSchema.parse({
      profileId: "default",
    });

    expect(parsed.profileId).toBe("default");
  });

  it("accepts create profile input", () => {
    const parsed = createProfileInputSchema.parse({
      name: "Combat Run",
      sourceProfileId: "default",
    });

    expect(parsed.name).toBe("Combat Run");
  });

  it("accepts save profile input and result", () => {
    const input = saveProfileInputSchema.parse({
      profileId: "default",
      name: "Default",
      activePackageIds: ["ludeon.rimworld", "unlimitedhugs.hugslib"],
      applyToGame: true,
    });
    const result = saveProfileResultSchema.parse({
      id: "default",
      name: "Default",
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:30:00.000Z",
    });

    expect(input.activePackageIds).toHaveLength(2);
    expect(result.updatedAt).toBe("2026-03-13T10:30:00.000Z");
  });

  it("accepts llm settings payloads and metadata search results", () => {
    const settings = llmSettingsSchema.parse({
      providers: [
        {
          id: "provider-1",
          name: "Anthropic Primary",
          format: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          apiKey: "secret-key",
          enabled: true,
          models: [
            {
              id: "model-1",
              modelId: "claude-sonnet-4-5-20250929",
              label: "Claude Sonnet 4.5",
              enabled: true,
              metadata: {
                contextLimit: 200000,
                inputLimit: null,
                outputLimit: 64000,
                supportsToolCall: true,
                supportsReasoning: true,
                supportsStructuredOutput: false,
                releaseDate: "2025-09-29",
                lastUpdated: "2025-09-29",
                pricing: {
                  inputCostPerMillion: 3,
                  outputCostPerMillion: 15,
                  reasoningCostPerMillion: null,
                  cacheReadCostPerMillion: null,
                  cacheWriteCostPerMillion: null,
                },
              },
              metadataSelection: {
                sourceProviderId: "anthropic",
                sourceProviderName: "Anthropic",
              },
              lastMetadataRefreshAt: "2026-03-14T10:00:00.000Z",
            },
          ],
        },
      ],
      updatedAt: "2026-03-14T10:05:00.000Z",
    });

    const saveInput = saveLlmSettingsInputSchema.parse({
      providers: settings.providers,
    });
    const savedMetadata = settings.providers[0]?.models[0]?.metadata;

    if (!savedMetadata) {
      throw new Error("Expected test metadata to be present.");
    }

    const searchResult = searchModelMetadataResultSchema.parse({
      query: "claude-sonnet-4-5-20250929",
      cachedAt: "2026-03-14T10:06:00.000Z",
      matches: [
        {
          sourceProviderId: "anthropic",
          sourceProviderName: "Anthropic",
          sourceProviderApi: "https://api.anthropic.com/v1",
          modelId: "claude-sonnet-4-5-20250929",
          modelName: "Claude Sonnet 4.5",
          family: "claude-sonnet",
          metadata: savedMetadata,
        },
      ],
    });

    expect(saveInput.providers[0]?.models[0]?.modelId).toBe(
      "claude-sonnet-4-5-20250929",
    );
    expect(searchResult.matches[0]?.metadata.contextLimit).toBe(200000);
  });
});

describe("rpc schema map", () => {
  it("exposes runtime schemas for every bun request", () => {
    const requests = rimunRpcSchemas.bun.requests;

    expect(Object.keys(requests).sort()).toEqual([
      "applyActivePackageIds",
      "createProfile",
      "deleteProfile",
      "detectPaths",
      "getBootstrap",
      "getI18nDictionaries",
      "getLlmSettings",
      "getModSourceSnapshot",
      "getProfileCatalog",
      "getSettings",
      "renameProfile",
      "saveLlmSettings",
      "saveProfile",
      "saveSettings",
      "searchModelMetadata",
      "switchProfile",
      "validatePath",
    ]);
  });
});
