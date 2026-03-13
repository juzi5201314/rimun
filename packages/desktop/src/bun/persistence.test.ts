import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsRepository, resolveDatabasePath } from "./persistence";

function createRepository() {
  process.env["RIMUN_APP_DATA_DIR"] = mkdtempSync(
    join(tmpdir(), "rimun-desktop-test-"),
  );

  return new SettingsRepository();
}

function cleanupRepository(repository: SettingsRepository) {
  repository.close();
  delete process.env["RIMUN_APP_DATA_DIR"];
}

describe("settings repository", () => {
  it("persists settings round-trip", () => {
    const repository = createRepository();
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

    cleanupRepository(repository);
  });

  it("initializes a default profile from imported active mods", () => {
    const repository = createRepository();
    const catalog = repository.getProfileCatalog([
      "ludeon.rimworld",
      "example.camera",
    ]);
    const currentProfile = repository.getCurrentProfile();

    expect(catalog.currentProfileId).toBe("default");
    expect(catalog.profiles).toHaveLength(1);
    expect(catalog.profiles[0]?.name).toBe("Default");
    expect(currentProfile.activePackageIds).toEqual([
      "ludeon.rimworld",
      "example.camera",
    ]);

    cleanupRepository(repository);
  });

  it("creates, saves, switches, and deletes profiles with fallback", () => {
    const repository = createRepository();
    const initialCatalog = repository.getProfileCatalog(["ludeon.rimworld"]);
    const createdCatalog = repository.createProfile({
      name: "Combat Run",
      sourceProfileId: initialCatalog.currentProfileId,
    });
    const createdProfile = createdCatalog.profiles.find(
      (profile) => profile.name === "Combat Run",
    );

    expect(createdProfile).toBeDefined();

    if (!createdProfile) {
      throw new Error("Expected Combat Run profile to exist.");
    }

    repository.switchProfile(createdProfile.id, ["ludeon.rimworld"]);
    const savedProfile = repository.saveProfile({
      profileId: createdProfile.id,
      name: "Combat Run",
      activePackageIds: ["ludeon.rimworld", "unlimitedhugs.hugslib"],
      applyToGame: false,
    });

    expect(savedProfile.activePackageIds).toEqual([
      "ludeon.rimworld",
      "unlimitedhugs.hugslib",
    ]);
    expect(repository.getCurrentProfileId()).toBe(createdProfile.id);

    const deletedCatalog = repository.deleteProfile(createdProfile.id);

    expect(deletedCatalog.currentProfileId).toBe("default");
    expect(deletedCatalog.profiles).toHaveLength(1);
    expect(() => repository.deleteProfile("default")).toThrow(
      "Cannot delete the last mod profile.",
    );

    cleanupRepository(repository);
  });

  it("merges official DLC into older profiles that do not store them yet", () => {
    const repository = createRepository();

    repository.getProfileCatalog(["ludeon.rimworld", "example.camera"]);
    const hydratedProfile = repository.getCurrentProfile([
      "ludeon.rimworld",
      "ludeon.rimworld.ideology",
      "example.camera",
    ]);

    expect(hydratedProfile.activePackageIds).toEqual([
      "ludeon.rimworld",
      "ludeon.rimworld.ideology",
      "example.camera",
    ]);

    cleanupRepository(repository);
  });
});
