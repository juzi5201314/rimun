import { describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PathSelection } from "@rimun/shared";
import { createRimunTempDir } from "../../../shared/test/tmp-path";
import {
  parseAboutXml,
  parseModsConfigXml,
  scanModLibrary,
  writeActiveModsToConfig,
} from "./mods";

function createSandboxLayout() {
  const sandboxRoot = createRimunTempDir("rimun-mod-scan-");
  const installationRoot = join(sandboxRoot, "installation");
  const installationModsRoot = join(installationRoot, "Mods");
  const installationDataRoot = join(installationRoot, "Data");
  const workshopRoot = join(sandboxRoot, "workshop");
  const configRoot = join(sandboxRoot, "config");

  mkdirSync(installationModsRoot, { recursive: true });
  mkdirSync(installationDataRoot, { recursive: true });
  mkdirSync(workshopRoot, { recursive: true });
  mkdirSync(configRoot, { recursive: true });

  return {
    configRoot,
    installationDataRoot,
    installationModsRoot,
    installationRoot,
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
  configRoot?: string;
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

    if (
      paths.configRoot &&
      windowsPath ===
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml"
    ) {
      return join(paths.configRoot, "ModsConfig.xml");
    }

    if (
      paths.configRoot &&
      windowsPath ===
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\Prefs.xml"
    ) {
      return join(paths.configRoot, "Prefs.xml");
    }

    if (
      paths.installationModsRoot &&
      windowsPath === "C:\\Games\\RimWorld\\Version.txt"
    ) {
      return join(paths.installationModsRoot, "..", "Version.txt");
    }

    return null;
  };
}

function writeAboutXml(
  modsRoot: string,
  folderName: string,
  content: string | Uint8Array,
) {
  mkdirSync(join(modsRoot, folderName, "About"), { recursive: true });
  writeFileSync(join(modsRoot, folderName, "About", "About.xml"), content);
}

function writeModsConfigXml(
  configRoot: string,
  activePackageIds: string[],
  options: {
    knownExpansionIds?: string[];
  } = {},
) {
  const knownExpansionIds = options.knownExpansionIds ?? [];

  writeFileSync(
    join(configRoot, "ModsConfig.xml"),
    `
      <ModsConfigData>
        <activeMods>
          ${activePackageIds.map((packageId) => `<li>${packageId}</li>`).join("\n")}
        </activeMods>
        ${
          knownExpansionIds.length > 0
            ? `
        <knownExpansions>
          ${knownExpansionIds.map((knownExpansionId) => `<li>${knownExpansionId}</li>`).join("\n")}
        </knownExpansions>
        `
            : ""
        }
      </ModsConfigData>
    `,
  );
}

function writePrefsXml(configRoot: string, languageFolderName: string) {
  writeFileSync(
    join(configRoot, "Prefs.xml"),
    `
      <Prefs>
        <langFolderName>${languageFolderName}</langFolderName>
      </Prefs>
    `,
  );
}

function writeGameVersionFile(installationRoot: string, versionText: string) {
  writeFileSync(join(installationRoot, "Version.txt"), versionText);
}

function writeDefsXml(
  modRoot: string,
  folderName: string,
  relativePath: string,
  content: string,
) {
  const absolutePath = join(modRoot, folderName, "Defs", relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function writeLanguageFile(
  modRoot: string,
  folderName: string,
  languageFolderName: string,
  relativePath: string,
  content: string,
) {
  const absolutePath = join(
    modRoot,
    folderName,
    "Languages",
    languageFolderName,
    relativePath,
  );
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function writeModFile(
  modRoot: string,
  folderName: string,
  relativePath: string,
  content: string,
) {
  const absolutePath = join(modRoot, folderName, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

const testEnvironment = {
  platform: "linux",
  isWsl: true,
  wslDistro: "Ubuntu",
} as const;

describe("mod scanner", () => {
  it("parses core About.xml fields", () => {
    const parsed = parseAboutXml(`
      <ModMetaData>
        <name>Core</name>
        <packageId>ludeon.rimworld</packageId>
        <author>Ludeon Studios</author>
        <supportedVersions>
          <li>1.5</li>
        </supportedVersions>
      </ModMetaData>
    `);

    expect(parsed.name).toBe("Core");
    expect(parsed.packageId).toBe("ludeon.rimworld");
    expect(parsed.author).toBe("Ludeon Studios");
    expect(parsed.version).toBeNull();
    expect(parsed.description).toBeNull();
    expect(parsed.dependencyMetadata.packageIdNormalized).toBe(
      "ludeon.rimworld",
    );
    expect(parsed.dependencyMetadata.supportedVersions).toEqual(["1.5"]);
  });

  it("parses active package ids from ModsConfig.xml and merges known expansions", () => {
    const parsed = parseModsConfigXml(`
      <ModsConfigData>
        <activeMods>
          <li>ludeon.rimworld</li>
          <li>unlimitedhugs.hugslib</li>
        </activeMods>
        <knownExpansions>
          <li>ideology</li>
        </knownExpansions>
      </ModsConfigData>
    `);

    expect(parsed.activePackageIds.has("ludeon.rimworld")).toBe(true);
    expect(parsed.activePackageIds.has("unlimitedhugs.hugslib")).toBe(true);
    expect(parsed.activePackageIds.has("ludeon.rimworld.ideology")).toBe(true);
    expect(parsed.activePackageIdsOrdered).toEqual([
      "ludeon.rimworld",
      "ludeon.rimworld.ideology",
      "unlimitedhugs.hugslib",
    ]);
  });

  it("scans installation and workshop roots into mod records", async () => {
    const {
      configRoot,
      installationDataRoot,
      installationModsRoot,
      installationRoot,
      workshopRoot,
    } = createSandboxLayout();
    writeGameVersionFile(installationRoot, "1.5.4104 rev435\n");

    writeAboutXml(
      installationModsRoot,
      "Core",
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
          <author>Ludeon Studios</author>
          <modVersion>1.5.4062</modVersion>
          <description>Core game content</description>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      workshopRoot,
      "818773962",
      `
        <ModMetaData>
          <name>HugsLib</name>
          <packageId>unlimitedhugs.hugslib</packageId>
          <authors>
            <li>UnlimitedHugs</li>
          </authors>
          <supportedVersions>
            <li>1.5</li>
          </supportedVersions>
          <description><![CDATA[Library helpers]]></description>
        </ModMetaData>
      `,
    );
    writeModsConfigXml(configRoot, [
      "ludeon.rimworld",
      "unlimitedhugs.hugslib",
    ]);

    const result = await scanModLibrary(createSelection(), {
      environment: testEnvironment,
      toReadablePath: createReadablePathResolver({
        configRoot,
        installationDataRoot,
        installationModsRoot,
        workshopRoot,
      }),
    });

    expect(result.requiresConfiguration).toBe(false);
    expect(result.gameVersion).toBe("1.5.4104 rev435");
    expect(result.mods).toHaveLength(2);
    expect(result.mods[0]?.name).toBe("Core");
    expect(result.mods[0]?.enabled).toBe(true);
    expect(result.mods[0]?.isOfficial).toBe(true);
    expect(result.mods[0]?.description).toBe("Core game content");
    expect(result.activePackageIds).toEqual([
      "ludeon.rimworld",
      "unlimitedhugs.hugslib",
    ]);
    expect(result.mods[1]?.source).toBe("workshop");
    expect(result.mods[1]?.enabled).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns a recoverable configuration error when install path is missing", async () => {
    const result = await scanModLibrary(null, {
      environment: testEnvironment,
      toReadablePath: () => null,
    });

    expect(result.requiresConfiguration).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.mods).toHaveLength(0);
  });

  it("keeps scanning mods when config path is missing but reports enabled-state fallback", async () => {
    const { installationDataRoot, installationModsRoot, installationRoot } =
      createSandboxLayout();
    writeGameVersionFile(installationRoot, "1.5.4104 rev435");

    writeAboutXml(
      installationModsRoot,
      "Core",
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
        </ModMetaData>
      `,
    );

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
        configPath: null,
      }),
      {
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );

    expect(result.mods).toHaveLength(1);
    expect(result.gameVersion).toBe("1.5.4104 rev435");
    expect(result.mods[0]?.enabled).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("uses active package id overrides for profile-backed scans", async () => {
    const {
      configRoot,
      installationDataRoot,
      installationModsRoot,
      installationRoot,
    } = createSandboxLayout();
    writeGameVersionFile(installationRoot, "1.5.4104 rev435");

    writeAboutXml(
      installationModsRoot,
      "Core",
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      installationDataRoot,
      "Ideology",
      `
        <ModMetaData>
          <name>Ideology</name>
          <packageId>ludeon.rimworld.ideology</packageId>
        </ModMetaData>
      `,
    );
    writeModsConfigXml(configRoot, ["ludeon.rimworld"]);

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        activePackageIdsOverride: [
          "ludeon.rimworld",
          "ludeon.rimworld.ideology",
        ],
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );

    expect(result.activePackageIds).toEqual([
      "ludeon.rimworld",
      "ludeon.rimworld.ideology",
    ]);
    expect(
      result.mods.filter((mod) => mod.enabled).map((mod) => mod.packageId),
    ).toEqual(["ludeon.rimworld", "ludeon.rimworld.ideology"]);
    expect(result.errors).toHaveLength(0);
  });

  it("scans official DLC from installation Data and resolves enabled state from knownExpansions", async () => {
    const {
      configRoot,
      installationDataRoot,
      installationModsRoot,
      installationRoot,
    } = createSandboxLayout();
    writeGameVersionFile(installationRoot, "1.5.4104 rev435");

    writeAboutXml(
      installationModsRoot,
      "Core",
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      installationDataRoot,
      "Ideology",
      `
        <ModMetaData>
          <name>Ideology</name>
          <packageId>ludeon.rimworld.ideology</packageId>
        </ModMetaData>
      `,
    );
    mkdirSync(join(installationDataRoot, "Shaders"), { recursive: true });
    writeModsConfigXml(configRoot, ["ludeon.rimworld"], {
      knownExpansionIds: ["ideology"],
    });

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );

    expect(result.activePackageIds).toEqual([
      "ludeon.rimworld",
      "ludeon.rimworld.ideology",
    ]);
    expect(result.mods.map((mod) => mod.name)).toEqual(["Core", "Ideology"]);
    expect(result.mods.every((mod) => mod.enabled)).toBe(true);
    expect(result.mods[1]?.windowsPath).toBe(
      "C:\\Games\\RimWorld\\Data\\Ideology",
    );
    expect(result.mods[1]?.isOfficial).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("decodes UTF-16 encoded About.xml content and preserves rich description text", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();

    writeAboutXml(
      installationModsRoot,
      "UnicodeMod",
      Buffer.concat([
        Buffer.from([0xff, 0xfe]),
        Buffer.from(
          `
            <ModMetaData>
              <name>Unicode Mod</name>
              <packageId>example.unicode</packageId>
              <description>First line

- Alpha
- Beta</description>
            </ModMetaData>
          `,
          "utf16le",
        ),
      ]),
    );
    writeModsConfigXml(configRoot, ["example.unicode"]);

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );

    expect(result.mods).toHaveLength(1);
    expect(result.mods[0]?.name).toBe("Unicode Mod");
    expect(result.mods[0]?.enabled).toBe(true);
    expect(result.mods[0]?.description).toBe("First line\n\n- Alpha\n- Beta");
  });

  it("scans more mods than a single worker chunk without losing records", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();
    const activePackageIds: string[] = [];

    for (let index = 0; index < 60; index += 1) {
      const packageId = `example.mod${index}`;
      activePackageIds.push(packageId);
      writeAboutXml(
        installationModsRoot,
        `Mod${index}`,
        `
          <ModMetaData>
            <name>Mod ${String(index).padStart(2, "0")}</name>
            <packageId>${packageId}</packageId>
            <author>Tester</author>
            <description>Fixture ${index}</description>
          </ModMetaData>
        `,
      );
    }

    writeModsConfigXml(configRoot, activePackageIds);

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );

    expect(result.mods).toHaveLength(60);
    expect(result.mods.every((mod) => mod.enabled)).toBe(true);
    expect(result.mods[0]?.name).toBe("Mod 00");
    expect(result.mods.at(-1)?.name).toBe("Mod 59");
    expect(result.errors).toHaveLength(0);
  });

  it("falls back to the main thread when the worker pool fails", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();

    writeAboutXml(
      installationModsRoot,
      "FallbackMod",
      `
        <ModMetaData>
          <name>Fallback Mod</name>
          <packageId>example.fallback</packageId>
          <description>Recovered after worker failure</description>
        </ModMetaData>
      `,
    );
    writeModsConfigXml(configRoot, ["example.fallback"]);

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        environment: testEnvironment,
        runWorkerChunks: async () => {
          throw new Error("synthetic worker crash");
        },
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );

    expect(result.mods).toHaveLength(1);
    expect(result.mods[0]?.name).toBe("Fallback Mod");
    expect(result.mods[0]?.enabled).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("unknown_error");
  });

  it("reports missing About.xml without aborting the scan", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();

    mkdirSync(join(installationModsRoot, "MissingAbout"), { recursive: true });
    writeModsConfigXml(configRoot, []);

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );

    expect(result.mods).toHaveLength(1);
    expect(result.mods[0]?.hasAboutXml).toBe(false);
    expect(result.mods[0]?.manifestPath).toBeNull();
    expect(result.mods[0]?.notes).toEqual(["About/About.xml was not found."]);
  });

  it("marks a mod without Languages directories as missing translation", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();
    writePrefsXml(configRoot, "ChineseSimplified");
    writeAboutXml(
      installationModsRoot,
      "NoTranslation",
      `
        <ModMetaData>
          <name>No Translation</name>
          <packageId>example.notranslation</packageId>
        </ModMetaData>
      `,
    );
    writeModsConfigXml(configRoot, ["example.notranslation"]);

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );

    expect(result.currentGameLanguage.folderName).toBe("ChineseSimplified");
    expect(result.mods[0]?.localizationStatus.kind).toBe("missing");
    expect(result.mods[0]?.localizationStatus.isSupported).toBe(false);
  });

  it("aggregates active translation mods and reports partial coverage", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();
    writePrefsXml(configRoot, "ChineseSimplified");
    writeAboutXml(
      installationModsRoot,
      "TargetMod",
      `
        <ModMetaData>
          <name>Target Mod</name>
          <packageId>example.target</packageId>
          <author>Source Author</author>
        </ModMetaData>
      `,
    );
    writeDefsXml(
      installationModsRoot,
      "TargetMod",
      "ThingDefs/Items.xml",
      `
        <Defs>
          <ThingDef>
            <defName>TargetItemOne</defName>
            <label>item one</label>
            <description>item one description</description>
          </ThingDef>
          <ThingDef>
            <defName>TargetItemTwo</defName>
            <label>item two</label>
            <description>item two description</description>
          </ThingDef>
        </Defs>
      `,
    );
    writeAboutXml(
      installationModsRoot,
      "TargetModChinese",
      `
        <ModMetaData>
          <name>Target Mod Chinese Pack</name>
          <packageId>example.target.zh</packageId>
          <modDependencies>
            <li>example.target</li>
          </modDependencies>
        </ModMetaData>
      `,
    );
    writeLanguageFile(
      installationModsRoot,
      "TargetModChinese",
      "ChineseSimplified",
      "DefInjected/ThingDef/ThingDefs/Items.xml",
      `
        <LanguageData>
          <TargetItemOne.label>条目一</TargetItemOne.label>
          <TargetItemOne.description>条目一描述</TargetItemOne.description>
        </LanguageData>
      `,
    );
    writeModsConfigXml(configRoot, ["example.target", "example.target.zh"]);

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );
    const targetMod = result.mods.find(
      (mod) => mod.packageId === "example.target",
    );

    expect(targetMod?.localizationStatus.kind).toBe("translated");
    expect(targetMod?.localizationStatus.coverage.completeness).toBe("partial");
    expect(targetMod?.localizationStatus.coverage.percent).toBe(50);
    expect(targetMod?.localizationStatus.providerPackageIds).toContain(
      "example.target.zh",
    );
  });

  it("loads conditional translation folders from LoadFolders.xml and matches DefInjected entries by def type", async () => {
    const {
      configRoot,
      installationDataRoot,
      installationModsRoot,
      installationRoot,
    } = createSandboxLayout();
    writeGameVersionFile(installationRoot, "1.6.4471 rev1205");
    writePrefsXml(configRoot, "ChineseSimplified");

    writeAboutXml(
      installationModsRoot,
      "ConditionalTarget",
      `
        <ModMetaData>
          <name>Conditional Target</name>
          <packageId>example.conditional.target</packageId>
        </ModMetaData>
      `,
    );
    writeModFile(
      installationModsRoot,
      "ConditionalTarget",
      "LoadFolders.xml",
      `
        <loadFolders>
          <v1.6>
            <li>/</li>
            <li>1.6</li>
            <li IfModActive="example.dependency">Addon</li>
          </v1.6>
        </loadFolders>
      `,
    );
    writeDefsXml(
      installationModsRoot,
      "ConditionalTarget/1.6",
      "ThingDefs/Items.xml",
      `
        <Defs>
          <ThingDef>
            <defName>BaseItem</defName>
            <label>base item</label>
            <description>base item description</description>
          </ThingDef>
        </Defs>
      `,
    );
    writeDefsXml(
      installationModsRoot,
      "ConditionalTarget/Addon",
      "ThingDefs/Items.xml",
      `
        <Defs>
          <ThingDef>
            <defName>AddonItem</defName>
            <label>addon item</label>
            <description>addon item description</description>
          </ThingDef>
        </Defs>
      `,
    );

    writeAboutXml(
      installationModsRoot,
      "ConditionalTargetChinese",
      `
        <ModMetaData>
          <name>Conditional Target Chinese Pack</name>
          <packageId>example.conditional.target.zh</packageId>
          <loadAfter>
            <li>example.conditional.target</li>
          </loadAfter>
        </ModMetaData>
      `,
    );
    writeModFile(
      installationModsRoot,
      "ConditionalTargetChinese",
      "LoadFolders.xml",
      `
        <loadFolders>
          <v1.6>
            <li>/</li>
            <li>Cont</li>
            <li IfModActive="example.dependency">Cont/Addon</li>
          </v1.6>
        </loadFolders>
      `,
    );
    writeLanguageFile(
      installationModsRoot,
      "ConditionalTargetChinese",
      "ChineseSimplified",
      "DefInjected/ThingDef/Noise.xml",
      `
        <LanguageData>
          <UnrelatedItem.label>无关条目</UnrelatedItem.label>
          <UnrelatedItem.description>无关描述</UnrelatedItem.description>
        </LanguageData>
      `,
    );
    writeModFile(
      installationModsRoot,
      "ConditionalTargetChinese",
      "Cont/Addon/Languages/ChineseSimplified/DefInjected/ThingDef/ArbitraryName.xml",
      `
        <LanguageData>
          <AddonItem.label>附加条目</AddonItem.label>
          <AddonItem.description>附加描述</AddonItem.description>
        </LanguageData>
      `,
    );

    writeModsConfigXml(configRoot, [
      "example.conditional.target",
      "example.dependency",
      "example.conditional.target.zh",
    ]);

    const result = await scanModLibrary(
      createSelection({
        workshopPath: null,
      }),
      {
        environment: testEnvironment,
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      },
    );
    const targetMod = result.mods.find(
      (mod) => mod.packageId === "example.conditional.target",
    );

    expect(targetMod?.localizationStatus.kind).toBe("translated");
    expect(targetMod?.localizationStatus.coverage.completeness).toBe("partial");
    expect(targetMod?.localizationStatus.coverage.coveredEntries).toBe(2);
    expect(targetMod?.localizationStatus.coverage.totalEntries).toBe(4);
    expect(targetMod?.localizationStatus.coverage.percent).toBe(50);
    expect(targetMod?.localizationStatus.providerPackageIds).toContain(
      "example.conditional.target.zh",
    );
  });

  it("writes official DLC back into knownExpansions instead of activeMods", () => {
    const { configRoot, installationDataRoot } = createSandboxLayout();

    writeModsConfigXml(configRoot, ["ludeon.rimworld"], {
      knownExpansionIds: ["ideology"],
    });

    writeActiveModsToConfig(
      createSelection(),
      ["ludeon.rimworld", "ludeon.rimworld.ideology", "unlimitedhugs.hugslib"],
      {
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
        }),
      },
    );

    const savedXml = readFileSync(join(configRoot, "ModsConfig.xml"), "utf8");

    expect(savedXml).toContain("<li>unlimitedhugs.hugslib</li>");
    expect(savedXml).toContain("<knownExpansions>");
    expect(savedXml).toContain("<li>ideology</li>");
    expect(savedXml).not.toContain("<li>ludeon.rimworld.ideology</li>");
  });
});
