import { describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

function writeGameVersionFile(installationRoot: string, versionText: string) {
  writeFileSync(join(installationRoot, "Version.txt"), versionText);
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
