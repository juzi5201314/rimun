import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PathSelection } from "@rimun/shared";
import { createRimunTempDir } from "../../../shared/test/tmp-path";
import {
  MAX_MOD_SCAN_WORKERS,
  getModScanPerfStatsForTests,
  readModSourceSnapshot,
  resetModScanPerfStateForTests,
} from "./mods";

function createSandboxLayout() {
  const sandboxRoot = createRimunTempDir("rimun-mod-perf-");
  const installationModsRoot = join(sandboxRoot, "installation", "Mods");
  const installationDataRoot = join(sandboxRoot, "installation", "Data");
  const workshopRoot = join(sandboxRoot, "workshop");

  mkdirSync(installationModsRoot, { recursive: true });
  mkdirSync(installationDataRoot, { recursive: true });
  mkdirSync(workshopRoot, { recursive: true });

  return {
    installationDataRoot,
    installationModsRoot,
    sandboxRoot,
    workshopRoot,
  };
}

function createSelection(
  overrides: Partial<PathSelection> = {},
): PathSelection {
  return {
    channel: "steam",
    installationPath: "C:\\Games\\RimWorld",
    workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
    configPath:
      "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    ...overrides,
  };
}

function createReadablePathResolver(paths: {
  installationDataRoot?: string;
  installationModsRoot?: string;
  workshopRoot?: string;
}) {
  return (windowsPath: string) => {
    if (
      paths.installationModsRoot &&
      windowsPath === "C:\\Games\\RimWorld\\Mods"
    ) {
      return paths.installationModsRoot;
    }

    if (
      paths.installationDataRoot &&
      windowsPath === "C:\\Games\\RimWorld\\Data"
    ) {
      return paths.installationDataRoot;
    }

    if (
      paths.workshopRoot &&
      windowsPath === "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100"
    ) {
      return paths.workshopRoot;
    }

    return null;
  };
}

function writeAboutXml(
  modsRoot: string,
  folderName: string,
  packageId: string,
) {
  mkdirSync(join(modsRoot, folderName, "About"), { recursive: true });
  writeFileSync(
    join(modsRoot, folderName, "About", "About.xml"),
    `
      <ModMetaData>
        <name>${folderName}</name>
        <packageId>${packageId}</packageId>
        <author>Perf Test</author>
      </ModMetaData>
    `,
  );
}

const testEnvironment = {
  platform: "linux",
  isWsl: true,
  wslDistro: "Ubuntu",
} as const;

beforeEach(() => {
  resetModScanPerfStateForTests();
});

afterEach(() => {
  resetModScanPerfStateForTests();
});

describe("mod scanner perf", () => {
  it("reuses the worker source and warm About.xml cache across rescans", async () => {
    const { installationDataRoot, installationModsRoot, workshopRoot } =
      createSandboxLayout();
    const activePackageIds: string[] = [];

    for (let index = 0; index < 12; index += 1) {
      const packageId = `example.perf${index}`;
      activePackageIds.push(packageId);
      writeAboutXml(installationModsRoot, `PerfMod${index}`, packageId);
    }

    const selection = createSelection({
      configPath: null,
      workshopPath: null,
    });
    const toReadablePath = createReadablePathResolver({
      installationDataRoot,
      installationModsRoot,
      workshopRoot,
    });

    await readModSourceSnapshot(selection, {
      activePackageIdsOverride: activePackageIds,
      environment: testEnvironment,
      toReadablePath,
    });

    const firstStats = getModScanPerfStatsForTests();

    expect(firstStats.workerSourceBuilds).toBe(1);
    expect(firstStats.aboutCacheHits).toBe(0);
    expect(firstStats.aboutCacheMisses).toBe(12);
    expect(firstStats.lastPoolSize).toBeLessThanOrEqual(MAX_MOD_SCAN_WORKERS);

    await readModSourceSnapshot(selection, {
      activePackageIdsOverride: activePackageIds,
      environment: testEnvironment,
      toReadablePath,
    });

    const warmStats = getModScanPerfStatsForTests();

    expect(warmStats.workerSourceBuilds).toBe(1);
    expect(warmStats.aboutCacheHits - firstStats.aboutCacheHits).toBe(12);
    expect(warmStats.aboutCacheMisses).toBe(firstStats.aboutCacheMisses);
    expect(warmStats.lastPoolSize).toBeLessThanOrEqual(MAX_MOD_SCAN_WORKERS);

    writeAboutXml(installationModsRoot, "PerfMod4", "example.perf4.changed");

    const changedSnapshot = await readModSourceSnapshot(selection, {
      activePackageIdsOverride: activePackageIds,
      environment: testEnvironment,
      toReadablePath,
    });

    expect(
      changedSnapshot.entries.find((entry) =>
        entry.modWindowsPath.endsWith("\\PerfMod4"),
      )?.aboutXmlText,
    ).toContain("example.perf4.changed");

    const changedStats = getModScanPerfStatsForTests();

    expect(changedStats.workerSourceBuilds).toBe(1);
    expect(changedStats.aboutCacheHits - warmStats.aboutCacheHits).toBe(11);
    expect(changedStats.aboutCacheMisses - warmStats.aboutCacheMisses).toBe(1);
  });

  it("VAL-HOST-PERF-001 warm rescan for items=2000 completes under 2000ms", async () => {
    const { installationDataRoot, installationModsRoot, workshopRoot } =
      createSandboxLayout();
    const activePackageIds: string[] = [];

    for (let index = 0; index < 2000; index += 1) {
      const packageId = `example.synthetic${index}`;
      activePackageIds.push(packageId);
      writeAboutXml(installationModsRoot, `SyntheticMod${index}`, packageId);
    }

    const selection = createSelection({
      configPath: null,
      workshopPath: null,
    });
    const toReadablePath = createReadablePathResolver({
      installationDataRoot,
      installationModsRoot,
      workshopRoot,
    });

    await readModSourceSnapshot(selection, {
      activePackageIdsOverride: activePackageIds,
      environment: testEnvironment,
      toReadablePath,
    });

    const warmScanStart = performance.now();
    const warmSnapshot = await readModSourceSnapshot(selection, {
      activePackageIdsOverride: activePackageIds,
      environment: testEnvironment,
      toReadablePath,
    });
    const warmScanMs = performance.now() - warmScanStart;
    const stats = getModScanPerfStatsForTests();

    console.log(
      `VAL-HOST-PERF-001 items=2000 warmRescanMs=${warmScanMs.toFixed(1)} cacheHits=${stats.aboutCacheHits} cacheMisses=${stats.aboutCacheMisses} pool=${stats.lastPoolSize}`,
    );

    expect(warmSnapshot.entries).toHaveLength(2000);
    expect(stats.aboutCacheHits).toBeGreaterThanOrEqual(2000);
    expect(stats.lastPoolSize).toBeLessThanOrEqual(MAX_MOD_SCAN_WORKERS);
    expect(warmScanMs).toBeLessThan(2000);
  });
});
