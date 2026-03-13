import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PathSelection } from "@rimun/shared";
import { parseAboutXml, parseModsConfigXml, scanModLibrary } from "./mods";

function createSandboxLayout() {
  const sandboxRoot = mkdtempSync(join("/tmp", "rimun-mod-scan-"));
  const installationModsRoot = join(sandboxRoot, "installation", "Mods");
  const workshopRoot = join(sandboxRoot, "workshop");
  const configRoot = join(sandboxRoot, "config");

  mkdirSync(installationModsRoot, { recursive: true });
  mkdirSync(workshopRoot, { recursive: true });
  mkdirSync(configRoot, { recursive: true });

  return {
    configRoot,
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
  configRoot?: string;
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

function writeModsConfigXml(configRoot: string, activePackageIds: string[]) {
  writeFileSync(
    join(configRoot, "ModsConfig.xml"),
    `
      <ModsConfigData>
        <activeMods>
          ${activePackageIds.map((packageId) => `<li>${packageId}</li>`).join("\n")}
        </activeMods>
      </ModsConfigData>
    `,
  );
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
    expect(parsed.version).toBe("1.5");
    expect(parsed.description).toBeNull();
    expect(parsed.dependencyMetadata.packageIdNormalized).toBe(
      "ludeon.rimworld",
    );
    expect(parsed.dependencyMetadata.supportedVersions).toEqual(["1.5"]);
  });

  it("parses active package ids from ModsConfig.xml", () => {
    const parsed = parseModsConfigXml(`
      <ModsConfigData>
        <activeMods>
          <li>ludeon.rimworld</li>
          <li>unlimitedhugs.hugslib</li>
        </activeMods>
      </ModsConfigData>
    `);

    expect(parsed.activePackageIds.has("ludeon.rimworld")).toBe(true);
    expect(parsed.activePackageIds.has("unlimitedhugs.hugslib")).toBe(true);
    expect(parsed.activePackageIdsOrdered).toEqual([
      "ludeon.rimworld",
      "unlimitedhugs.hugslib",
    ]);
  });

  it("scans installation and workshop roots into mod records", async () => {
    const { configRoot, installationModsRoot, workshopRoot } =
      createSandboxLayout();

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
        installationModsRoot,
        workshopRoot,
      }),
    });

    expect(result.requiresConfiguration).toBe(false);
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
    const { installationModsRoot } = createSandboxLayout();

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
          installationModsRoot,
        }),
      },
    );

    expect(result.mods).toHaveLength(1);
    expect(result.mods[0]?.enabled).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it("uses active package id overrides for profile-backed scans", async () => {
    const { configRoot, installationModsRoot } = createSandboxLayout();

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
      installationModsRoot,
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

  it("decodes UTF-16 encoded About.xml content and preserves rich description text", async () => {
    const { configRoot, installationModsRoot } = createSandboxLayout();

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
    const { configRoot, installationModsRoot } = createSandboxLayout();
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
    const { configRoot, installationModsRoot } = createSandboxLayout();

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
    const { configRoot, installationModsRoot } = createSandboxLayout();

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
          installationModsRoot,
        }),
      },
    );

    expect(result.mods).toHaveLength(1);
    expect(result.mods[0]?.hasAboutXml).toBe(false);
    expect(result.mods[0]?.manifestPath).toBeNull();
    expect(result.mods[0]?.notes).toEqual(["About/About.xml was not found."]);
  });
});
