import { describe, expect, it } from "bun:test";

import {
  bootstrapPayloadSchema,
  detectPathsResultSchema,
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
});

describe("rpc schema map", () => {
  it("exposes runtime schemas for every bun request", () => {
    const requests = rimunRpcSchemas.bun.requests;

    expect(Object.keys(requests).sort()).toEqual([
      "detectPaths",
      "getBootstrap",
      "getSettings",
      "saveSettings",
      "validatePath",
    ]);
  });
});
