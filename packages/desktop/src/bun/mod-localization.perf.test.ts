import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModSourceSnapshotEntry } from "@rimun/shared";
import { createRimunTempDir } from "../../../shared/test/tmp-path";
import {
  analyzeModLocalizations,
  getModLocalizationPerfStatsForTests,
  resetModLocalizationPerfStateForTests,
} from "./mod-localization";

const originalAppDataDir = process.env["RIMUN_APP_DATA_DIR"] ?? null;

function createManifestMetadata(args: {
  folderName: string;
  packageId: string;
}) {
  return {
    author: null,
    dependencyMetadata: {
      dependencies: [] as string[],
      forceLoadAfter: [] as string[],
      forceLoadBefore: [] as string[],
      incompatibleWith: [] as string[],
      loadAfter: [] as string[],
      loadBefore: [] as string[],
      packageIdNormalized: args.packageId,
      supportedVersions: [] as string[],
    },
    description: null,
    name: args.folderName,
    packageId: args.packageId,
    version: null,
  };
}

function createSandboxLayout() {
  const sandboxRoot = createRimunTempDir("rimun-localization-perf-");
  const modsRoot = join(sandboxRoot, "Mods");
  const configRoot = join(sandboxRoot, "Config");

  mkdirSync(modsRoot, { recursive: true });
  mkdirSync(configRoot, { recursive: true });

  return {
    configRoot,
    modsRoot,
    sandboxRoot,
  };
}

function setTestAppDataDir(sandboxRoot: string) {
  process.env["RIMUN_APP_DATA_DIR"] = join(sandboxRoot, "app-data");
}

function writePrefs(configRoot: string, folderName = "ChineseSimplified") {
  writeFileSync(
    join(configRoot, "Prefs.xml"),
    `<Prefs><langFolderName>${folderName}</langFolderName></Prefs>`,
  );
}

function writeSyntheticMod(modsRoot: string, index: number) {
  const folderName = `PerfMod${index}`;
  const packageId = `example.perf${index}`;
  const modRoot = join(modsRoot, folderName);

  mkdirSync(join(modRoot, "About"), { recursive: true });
  mkdirSync(join(modRoot, "Defs"), { recursive: true });
  mkdirSync(join(modRoot, "Languages", "English", "Keyed"), {
    recursive: true,
  });
  mkdirSync(join(modRoot, "Languages", "ChineseSimplified", "Keyed"), {
    recursive: true,
  });

  const aboutXmlText = `
    <ModMetaData>
      <name>${folderName}</name>
      <packageId>${packageId}</packageId>
    </ModMetaData>
  `;

  writeFileSync(join(modRoot, "About", "About.xml"), aboutXmlText);
  writeFileSync(
    join(modRoot, "Defs", "ThingDefs.xml"),
    `<Defs>${Array.from(
      { length: 40 },
      (_, defIndex) =>
        `<ThingDef><defName>PerfThing_${index}_${defIndex}</defName><label>Label ${defIndex}</label><description>Description ${defIndex}</description></ThingDef>`,
    ).join("")}</Defs>`,
  );
  writeFileSync(
    join(modRoot, "Languages", "English", "Keyed", "Main.xml"),
    `<LanguageData>${Array.from(
      { length: 120 },
      (_, keyedIndex) =>
        `<perf_key_${keyedIndex}>Value ${keyedIndex}</perf_key_${keyedIndex}>`,
    ).join("")}</LanguageData>`,
  );
  writeFileSync(
    join(modRoot, "Languages", "ChineseSimplified", "Keyed", "Main.xml"),
    `<LanguageData>${Array.from(
      { length: 120 },
      (_, keyedIndex) =>
        `<perf_key_${keyedIndex}>值 ${keyedIndex}</perf_key_${keyedIndex}>`,
    ).join("")}</LanguageData>`,
  );

  return {
    entryName: folderName,
    source: "installation",
    modWindowsPath: `C:\\Games\\RimWorld\\Mods\\${folderName}`,
    modReadablePath: modRoot,
    manifestPath: null,
    manifestMetadata: createManifestMetadata({
      folderName,
      packageId,
    }),
    hasAboutXml: true,
    aboutXmlText,
    localizationStatus: {
      kind: "missing",
      isSupported: false,
      matchedFolderName: null,
      providerPackageIds: [],
      coverage: {
        completeness: "unknown",
        coveredEntries: 0,
        totalEntries: null,
        percent: null,
      },
    },
    notes: [],
  } satisfies ModSourceSnapshotEntry;
}

function rewriteSyntheticTranslation(modsRoot: string, index: number, suffix: string) {
  const folderName = `PerfMod${index}`;
  writeFileSync(
    join(
      modsRoot,
      folderName,
      "Languages",
      "ChineseSimplified",
      "Keyed",
      "Main.xml",
    ),
    `<LanguageData>${Array.from(
      { length: 120 },
      (_, keyedIndex) =>
        `<perf_key_${keyedIndex}>值 ${keyedIndex} ${suffix}</perf_key_${keyedIndex}>`,
    ).join("")}</LanguageData>`,
  );
}

function createReadablePathResolver(configRoot: string) {
  return (windowsPath: string) =>
    windowsPath.endsWith("\\Prefs.xml") ? join(configRoot, "Prefs.xml") : null;
}

beforeEach(() => {
  resetModLocalizationPerfStateForTests();
  delete process.env["RIMUN_APP_DATA_DIR"];
});

afterEach(() => {
  resetModLocalizationPerfStateForTests();
  if (originalAppDataDir === null) {
    delete process.env["RIMUN_APP_DATA_DIR"];
    return;
  }

  process.env["RIMUN_APP_DATA_DIR"] = originalAppDataDir;
});

describe("mod localization perf", () => {
  it("reuses descriptor caches on warm rescans", async () => {
    const { configRoot, modsRoot, sandboxRoot } = createSandboxLayout();
    setTestAppDataDir(sandboxRoot);
    writePrefs(configRoot);
    const entries = Array.from({ length: 120 }, (_, index) =>
      writeSyntheticMod(modsRoot, index),
    );
    const args = {
      activePackageIds: entries.map(
        (entry) =>
          /<packageId>([^<]+)<\/packageId>/.exec(
            entry.aboutXmlText ?? "",
          )?.[1] ?? "",
      ),
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      entries,
      gameVersion: "1.5.4104 rev435",
      toReadablePath: createReadablePathResolver(configRoot),
    };

    const coldStart = performance.now();
    await analyzeModLocalizations(args);
    const coldMs = performance.now() - coldStart;
    const coldStats = getModLocalizationPerfStatsForTests();

    const warmStart = performance.now();
    const warmAnalysis = await analyzeModLocalizations(args);
    const warmMs = performance.now() - warmStart;
    const warmStats = getModLocalizationPerfStatsForTests();

    console.log(
      `VAL-LOCALIZATION-PERF-001 mods=${entries.length} coldMs=${coldMs.toFixed(1)} warmMs=${warmMs.toFixed(1)} descriptorHits=${warmStats.descriptorCacheHits} descriptorMisses=${warmStats.descriptorCacheMisses}`,
    );

    expect(warmAnalysis.entries).toHaveLength(entries.length);
    expect(warmStats.descriptorCacheHits - coldStats.descriptorCacheHits).toBe(
      entries.length,
    );
    expect(warmMs).toBeLessThan(coldMs);
  });

  it("VAL-LOCALIZATION-PERF-002 cold request for mods=600 completes under 2000ms", async () => {
    const { configRoot, modsRoot, sandboxRoot } = createSandboxLayout();
    setTestAppDataDir(sandboxRoot);
    writePrefs(configRoot);
    const entries = Array.from({ length: 600 }, (_, index) =>
      writeSyntheticMod(modsRoot, index),
    );
    const args = {
      activePackageIds: entries.map(
        (entry) =>
          /<packageId>([^<]+)<\/packageId>/.exec(
            entry.aboutXmlText ?? "",
          )?.[1] ?? "",
      ),
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      entries,
      gameVersion: "1.5.4104 rev435",
      toReadablePath: createReadablePathResolver(configRoot),
    };

    const coldStart = performance.now();
    const analysis = await analyzeModLocalizations(args);
    const coldMs = performance.now() - coldStart;
    const stats = getModLocalizationPerfStatsForTests();

    console.log(
      `VAL-LOCALIZATION-PERF-002 mods=600 coldMs=${coldMs.toFixed(1)} descriptorHits=${stats.descriptorCacheHits} descriptorMisses=${stats.descriptorCacheMisses} descriptorDbHits=${stats.descriptorDbHits} descriptorDbMisses=${stats.descriptorDbMisses} providerBitmapMs=${stats.providerBitmapBuildMs.toFixed(1)} statusComputeMs=${stats.statusComputeMs.toFixed(1)}`,
    );

    expect(analysis.entries).toHaveLength(entries.length);
    expect(coldMs).toBeLessThan(2000);
  }, 20_000);

  it("VAL-LOCALIZATION-PERF-003 incremental request for mods=600 completes under 2000ms", async () => {
    const { configRoot, modsRoot, sandboxRoot } = createSandboxLayout();
    setTestAppDataDir(sandboxRoot);
    writePrefs(configRoot);
    const entries = Array.from({ length: 600 }, (_, index) =>
      writeSyntheticMod(modsRoot, index),
    );
    const args = {
      activePackageIds: entries.map(
        (entry) =>
          /<packageId>([^<]+)<\/packageId>/.exec(
            entry.aboutXmlText ?? "",
          )?.[1] ?? "",
      ),
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      entries,
      gameVersion: "1.5.4104 rev435",
      toReadablePath: createReadablePathResolver(configRoot),
    };

    await analyzeModLocalizations(args);

    for (const index of [3, 17, 88, 233, 511]) {
      rewriteSyntheticTranslation(modsRoot, index, "changed");
    }

    const changedStart = performance.now();
    const analysis = await analyzeModLocalizations(args);
    const changedMs = performance.now() - changedStart;
    const stats = getModLocalizationPerfStatsForTests();

    console.log(
      `VAL-LOCALIZATION-PERF-003 mods=600 changedMs=${changedMs.toFixed(1)} descriptorHits=${stats.descriptorCacheHits} descriptorMisses=${stats.descriptorCacheMisses} descriptorDbHits=${stats.descriptorDbHits} descriptorDbMisses=${stats.descriptorDbMisses} defsHits=${stats.defsCacheHits} defsMisses=${stats.defsCacheMisses}`,
    );

    expect(analysis.entries).toHaveLength(entries.length);
    expect(changedMs).toBeLessThan(2000);
  }, 20_000);
});
