import { describe, expect, it } from "bun:test";

import {
  applyModOrderRecommendationInputSchema,
  bootstrapPayloadSchema,
  detectPathsResultSchema,
  modLibraryResultSchema,
  modOrderAnalysisResultSchema,
  rimunRpcSchemas,
  saveSettingsInputSchema,
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

  it("accepts a mod library payload with installation and workshop mods", () => {
    const parsed = modLibraryResultSchema.parse({
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
      mods: [
        {
          id: "installation:ludeon.rimworld",
          name: "Core",
          packageId: "ludeon.rimworld",
          author: "Ludeon Studios",
          version: "1.5.4062",
          description: "Core game content",
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
          dependencyMetadata: {
            packageIdNormalized: "ludeon.rimworld",
            dependencies: [],
            loadAfter: [],
            loadBefore: [],
            forceLoadAfter: [],
            forceLoadBefore: [],
            incompatibleWith: [],
            supportedVersions: [],
          },
          notes: [],
        },
      ],
      errors: [],
      requiresConfiguration: false,
    });

    expect(parsed.mods).toHaveLength(1);
    expect(parsed.mods[0]?.source).toBe("installation");
    expect(parsed.activePackageIds).toEqual(["ludeon.rimworld"]);
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

  it("accepts apply recommendation input", () => {
    const parsed = applyModOrderRecommendationInputSchema.parse({
      actions: ["enableMissingDependencies", "reorderActiveMods"],
    });

    expect(parsed.actions).toHaveLength(2);
  });
});

describe("rpc schema map", () => {
  it("exposes runtime schemas for every bun request", () => {
    const requests = rimunRpcSchemas.bun.requests;

    expect(Object.keys(requests).sort()).toEqual([
      "analyzeModOrder",
      "applyModOrderRecommendation",
      "detectPaths",
      "getBootstrap",
      "getModLibrary",
      "getSettings",
      "saveSettings",
      "validatePath",
    ]);
  });
});
