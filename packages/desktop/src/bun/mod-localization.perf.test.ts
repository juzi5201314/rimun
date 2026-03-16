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

function createSandboxLayout() {
  const sandboxRoot = createRimunTempDir("rimun-localization-perf-");
  const modsRoot = join(sandboxRoot, "Mods");
  const configRoot = join(sandboxRoot, "Config");

  mkdirSync(modsRoot, { recursive: true });
  mkdirSync(configRoot, { recursive: true });

  return {
    configRoot,
    modsRoot,
  };
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

function createReadablePathResolver(configRoot: string) {
  return (windowsPath: string) =>
    windowsPath.endsWith("\\Prefs.xml") ? join(configRoot, "Prefs.xml") : null;
}

beforeEach(() => {
  resetModLocalizationPerfStateForTests();
});

afterEach(() => {
  resetModLocalizationPerfStateForTests();
});

describe("mod localization perf", () => {
  it("reuses descriptor caches on warm rescans", async () => {
    const { configRoot, modsRoot } = createSandboxLayout();
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
});
