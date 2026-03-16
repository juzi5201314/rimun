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

function createSandboxLayout() {
  const sandboxRoot = createRimunTempDir("rimun-localization-");
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

function writeAboutXml(
  modsRoot: string,
  folderName: string,
  packageId: string,
  options: {
    dependencies?: string[];
    loadAfter?: string[];
  } = {},
) {
  mkdirSync(join(modsRoot, folderName, "About"), { recursive: true });
  const dependencies =
    options.dependencies && options.dependencies.length > 0
      ? `<modDependencies>${options.dependencies
          .map(
            (packageIdEntry) =>
              `<li><packageId>${packageIdEntry}</packageId></li>`,
          )
          .join("")}</modDependencies>`
      : "";
  const loadAfter =
    options.loadAfter && options.loadAfter.length > 0
      ? `<loadAfter>${options.loadAfter.map((packageIdEntry) => `<li>${packageIdEntry}</li>`).join("")}</loadAfter>`
      : "";
  const aboutXmlText = `
    <ModMetaData>
      <name>${folderName}</name>
      <packageId>${packageId}</packageId>
      ${dependencies}
      ${loadAfter}
    </ModMetaData>
  `;

  writeFileSync(join(modsRoot, folderName, "About", "About.xml"), aboutXmlText);
  return aboutXmlText;
}

function writeKeyedXml(
  modsRoot: string,
  folderName: string,
  languageFolderName: string,
  fileName: string,
  pairs: Array<{ key: string; value: string }>,
) {
  const directoryPath = join(
    modsRoot,
    folderName,
    "Languages",
    languageFolderName,
    "Keyed",
  );

  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(
    join(directoryPath, fileName),
    `<LanguageData>${pairs
      .map((pair) => `<${pair.key}>${pair.value}</${pair.key}>`)
      .join("")}</LanguageData>`,
  );
}

function writeDefInjectedXml(
  modsRoot: string,
  folderName: string,
  languageFolderName: string,
  entries: Array<{ path: string; value: string }>,
) {
  const directoryPath = join(
    modsRoot,
    folderName,
    "Languages",
    languageFolderName,
    "DefInjected",
    "ThingDefs",
  );

  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(
    join(directoryPath, "ThingDefs.xml"),
    `<LanguageData>${entries
      .map((entry) => `<${entry.path}>${entry.value}</${entry.path}>`)
      .join("")}</LanguageData>`,
  );
}

function writeDefsXml(
  modsRoot: string,
  folderName: string,
  entries: Array<{ defName: string; description: string; label: string }>,
) {
  const directoryPath = join(modsRoot, folderName, "Defs");

  mkdirSync(directoryPath, { recursive: true });
  writeFileSync(
    join(directoryPath, "ThingDefs.xml"),
    `<Defs>${entries
      .map(
        (entry) =>
          `<ThingDef><defName>${entry.defName}</defName><label>${entry.label}</label><description>${entry.description}</description></ThingDef>`,
      )
      .join("")}</Defs>`,
  );
}

function createEntry(args: {
  aboutXmlText: string;
  folderName: string;
  modsRoot: string;
}): ModSourceSnapshotEntry {
  return {
    entryName: args.folderName,
    source: "installation",
    modWindowsPath: `C:\\Games\\RimWorld\\Mods\\${args.folderName}`,
    modReadablePath: join(args.modsRoot, args.folderName),
    manifestPath: null,
    hasAboutXml: true,
    aboutXmlText: args.aboutXmlText,
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
  };
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

describe("mod localization analyzer", () => {
  it("matches translation providers through the reverse translation index", async () => {
    const { configRoot, modsRoot, sandboxRoot } = createSandboxLayout();
    setTestAppDataDir(sandboxRoot);
    writePrefs(configRoot);
    const baseAbout = writeAboutXml(modsRoot, "BaseMod", "example.base");
    const translatorAbout = writeAboutXml(
      modsRoot,
      "TranslatorMod",
      "example.translator",
      {
        loadAfter: ["example.base"],
      },
    );

    writeKeyedXml(modsRoot, "BaseMod", "English", "Main.xml", [
      { key: "base_key", value: "Base Value" },
    ]);
    writeKeyedXml(modsRoot, "TranslatorMod", "ChineseSimplified", "Main.xml", [
      { key: "base_key", value: "基础值" },
    ]);

    const analysis = await analyzeModLocalizations({
      activePackageIds: ["example.base", "example.translator"],
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      entries: [
        createEntry({
          aboutXmlText: baseAbout,
          folderName: "BaseMod",
          modsRoot,
        }),
        createEntry({
          aboutXmlText: translatorAbout,
          folderName: "TranslatorMod",
          modsRoot,
        }),
      ],
      gameVersion: "1.5.4104 rev435",
      toReadablePath: createReadablePathResolver(configRoot),
    });

    const baseEntry = analysis.entries.find(
      (entry) => entry.entryName === "BaseMod",
    );

    expect(baseEntry?.localizationStatus.kind).toBe("translated");
    expect(baseEntry?.localizationStatus.providerPackageIds).toContain(
      "example.translator",
    );
  });

  it("accepts XML declarations with leading whitespace in translation files", async () => {
    const { configRoot, modsRoot, sandboxRoot } = createSandboxLayout();
    setTestAppDataDir(sandboxRoot);
    writePrefs(configRoot);
    const aboutXmlText = writeAboutXml(
      modsRoot,
      "XmlDeclMod",
      "example.xmldecl",
    );

    mkdirSync(
      join(modsRoot, "XmlDeclMod", "Languages", "ChineseSimplified", "Keyed"),
      {
        recursive: true,
      },
    );
    writeFileSync(
      join(
        modsRoot,
        "XmlDeclMod",
        "Languages",
        "ChineseSimplified",
        "Keyed",
        "Main.xml",
      ),
      `\n    <?xml version="1.0" encoding="utf-8"?>\n    <LanguageData><decl_key>值</decl_key></LanguageData>`,
    );

    const analysis = await analyzeModLocalizations({
      activePackageIds: ["example.xmldecl"],
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      entries: [
        createEntry({
          aboutXmlText,
          folderName: "XmlDeclMod",
          modsRoot,
        }),
      ],
      gameVersion: "1.5.4104 rev435",
      toReadablePath: createReadablePathResolver(configRoot),
    });

    expect(analysis.entries[0]?.localizationStatus.kind).toBe("translated");
  });

  it("recovers malformed translation xml files and keeps them effective", async () => {
    const { configRoot, modsRoot, sandboxRoot } = createSandboxLayout();
    setTestAppDataDir(sandboxRoot);
    writePrefs(configRoot);
    const baseAbout = writeAboutXml(modsRoot, "BaseMod", "example.base");
    const translatorAbout = writeAboutXml(
      modsRoot,
      "TranslatorMod",
      "example.translator",
      {
        loadAfter: ["example.base"],
      },
    );

    writeKeyedXml(modsRoot, "BaseMod", "English", "Main.xml", [
      { key: "base_key", value: "Base Value" },
    ]);
    writeKeyedXml(modsRoot, "TranslatorMod", "ChineseSimplified", "Main.xml", [
      { key: "base_key", value: "基础值" },
    ]);
    writeFileSync(
      join(
        modsRoot,
        "TranslatorMod",
        "Languages",
        "ChineseSimplified",
        "Keyed",
        "Broken.xml",
      ),
      "<LanguageData><broken>oops</LanguageData>",
    );

    const analysis = await analyzeModLocalizations({
      activePackageIds: ["example.base", "example.translator"],
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      entries: [
        createEntry({
          aboutXmlText: baseAbout,
          folderName: "BaseMod",
          modsRoot,
        }),
        createEntry({
          aboutXmlText: translatorAbout,
          folderName: "TranslatorMod",
          modsRoot,
        }),
      ],
      gameVersion: "1.5.4104 rev435",
      toReadablePath: createReadablePathResolver(configRoot),
    });

    const baseEntry = analysis.entries.find(
      (entry) => entry.entryName === "BaseMod",
    );

    expect(baseEntry?.localizationStatus.kind).toBe("translated");
    expect(baseEntry?.localizationStatus.providerPackageIds).toContain(
      "example.translator",
    );
    expect(getModLocalizationPerfStatsForTests()).toMatchObject({
      recoveredFiles: 1,
      strictParseFailures: 1,
      unrecoverableFiles: 0,
    });
  });

  it("recovers malformed defs xml files when deriving def-injected baseline coverage", async () => {
    const { configRoot, modsRoot, sandboxRoot } = createSandboxLayout();
    setTestAppDataDir(sandboxRoot);
    writePrefs(configRoot);
    const aboutXmlText = writeAboutXml(
      modsRoot,
      "BrokenDefsMod",
      "example.brokendefs",
    );

    writeDefsXml(modsRoot, "BrokenDefsMod", [
      {
        defName: "BrokenThing",
        description: "Broken description",
        label: "Broken label",
      },
    ]);
    writeFileSync(
      join(modsRoot, "BrokenDefsMod", "Defs", "Broken.xml"),
      "<Defs><ThingDef><defName>Oops</defName><label>bad</Defs>",
    );
    writeDefInjectedXml(modsRoot, "BrokenDefsMod", "ChineseSimplified", [
      { path: "BrokenThing.label", value: "损坏标签" },
      { path: "BrokenThing.description", value: "损坏描述" },
      { path: "Oops.label", value: "恢复标签" },
    ]);

    const analysis = await analyzeModLocalizations({
      activePackageIds: ["example.brokendefs"],
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      entries: [
        createEntry({
          aboutXmlText,
          folderName: "BrokenDefsMod",
          modsRoot,
        }),
      ],
      gameVersion: "1.5.4104 rev435",
      toReadablePath: createReadablePathResolver(configRoot),
    });

    expect(analysis.entries[0]?.localizationStatus.kind).toBe("translated");
    expect(analysis.entries[0]?.localizationStatus.coverage.totalEntries).toBe(
      3,
    );
    expect(getModLocalizationPerfStatsForTests()).toMatchObject({
      recoveredFiles: 1,
      strictParseFailures: 1,
      unrecoverableFiles: 0,
    });
  });

  it("reuses descriptor and defs caches and invalidates only changed inputs", async () => {
    const { configRoot, modsRoot, sandboxRoot } = createSandboxLayout();
    setTestAppDataDir(sandboxRoot);
    writePrefs(configRoot);
    const aboutXmlText = writeAboutXml(modsRoot, "LazyDefsMod", "example.lazy");

    writeDefsXml(modsRoot, "LazyDefsMod", [
      {
        defName: "LazyThing",
        description: "Lazy description",
        label: "Lazy label",
      },
    ]);
    writeDefInjectedXml(modsRoot, "LazyDefsMod", "ChineseSimplified", [
      { path: "LazyThing.label", value: "懒标签" },
      { path: "LazyThing.description", value: "懒描述" },
    ]);

    const baseArgs = {
      activePackageIds: ["example.lazy"],
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      entries: [
        createEntry({
          aboutXmlText,
          folderName: "LazyDefsMod",
          modsRoot,
        }),
      ],
      gameVersion: "1.5.4104 rev435",
      toReadablePath: createReadablePathResolver(configRoot),
    };

    const firstAnalysis = await analyzeModLocalizations(baseArgs);
    const firstStats = getModLocalizationPerfStatsForTests();

    expect(firstAnalysis.entries[0]?.localizationStatus.kind).toBe(
      "translated",
    );
    expect(
      firstAnalysis.entries[0]?.localizationStatus.coverage.totalEntries,
    ).toBe(2);
    expect(firstStats.descriptorCacheMisses).toBe(1);
    expect(firstStats.defsCacheMisses).toBe(1);

    await analyzeModLocalizations(baseArgs);
    const warmStats = getModLocalizationPerfStatsForTests();

    expect(warmStats.descriptorCacheHits - firstStats.descriptorCacheHits).toBe(
      1,
    );
    expect(warmStats.defsCacheHits - firstStats.defsCacheHits).toBe(1);

    writeDefInjectedXml(modsRoot, "LazyDefsMod", "ChineseSimplified", [
      { path: "LazyThing.label", value: "懒标签-变更" },
      { path: "LazyThing.description", value: "懒描述-变更" },
    ]);

    await analyzeModLocalizations(baseArgs);
    const changedTranslationStats = getModLocalizationPerfStatsForTests();

    expect(
      changedTranslationStats.descriptorCacheMisses -
        warmStats.descriptorCacheMisses,
    ).toBe(1);
    expect(
      changedTranslationStats.defsCacheHits - warmStats.defsCacheHits,
    ).toBe(1);

    writeDefsXml(modsRoot, "LazyDefsMod", [
      {
        defName: "LazyThing",
        description: "Lazy description changed",
        label: "Lazy label changed",
      },
    ]);

    await analyzeModLocalizations(baseArgs);
    const changedDefsStats = getModLocalizationPerfStatsForTests();

    expect(
      changedDefsStats.descriptorCacheHits -
        changedTranslationStats.descriptorCacheHits,
    ).toBe(1);
    expect(
      changedDefsStats.defsCacheMisses -
        changedTranslationStats.defsCacheMisses,
    ).toBe(1);
  });
});
