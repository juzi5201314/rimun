import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsRepository, resolveDatabasePath } from "./persistence";

describe("settings repository", () => {
  it("persists settings round-trip", () => {
    process.env["RIMUN_APP_DATA_DIR"] = mkdtempSync(
      join(tmpdir(), "rimun-desktop-test-"),
    );
    const repository = new SettingsRepository();
    const saved = repository.saveSettings({
      channel: "steam",
      installationPath: "C:\\Games\\RimWorld",
      workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    });
    const loaded = repository.getSettings();

    expect(resolveDatabasePath().endsWith("rimun.sqlite")).toBe(true);
    expect(saved.installationPath).toBe("C:\\Games\\RimWorld");
    expect(loaded.installationPath).toBe("C:\\Games\\RimWorld");

    repository.close();
    delete process.env["RIMUN_APP_DATA_DIR"];
  });
});
