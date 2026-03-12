import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import type { PathSelection } from "@rimun/shared";
import { parseAboutXml, parseModsConfigXml, scanModLibrary } from "./mods";

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
  });

  it("scans installation and workshop roots into mod records", () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), "rimun-mod-scan-"));
    const installationModsRoot = join(sandboxRoot, "installation", "Mods");
    const workshopRoot = join(sandboxRoot, "workshop");
    const configRoot = join(sandboxRoot, "config");

    mkdirSync(join(installationModsRoot, "Core", "About"), { recursive: true });
    mkdirSync(join(workshopRoot, "818773962", "About"), { recursive: true });
    mkdirSync(configRoot, { recursive: true });

    writeFileSync(
      join(installationModsRoot, "Core", "About", "About.xml"),
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
    writeFileSync(
      join(workshopRoot, "818773962", "About", "About.xml"),
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
    writeFileSync(
      join(configRoot, "ModsConfig.xml"),
      `
        <ModsConfigData>
          <activeMods>
            <li>ludeon.rimworld</li>
            <li>unlimitedhugs.hugslib</li>
          </activeMods>
        </ModsConfigData>
      `,
    );

    const selection: PathSelection = {
      channel: "steam",
      installationPath: "C:\\Games\\RimWorld",
      workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
      configPath: "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    };

    const result = scanModLibrary(selection, {
      environment: {
        platform: "linux",
        isWsl: true,
        wslDistro: "Ubuntu",
      },
      toReadablePath: (windowsPath) => {
        if (windowsPath === "C:\\Games\\RimWorld\\Mods") {
          return installationModsRoot;
        }

        if (
          windowsPath === "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100"
        ) {
          return workshopRoot;
        }

        if (
          windowsPath ===
          "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml"
        ) {
          return join(configRoot, "ModsConfig.xml");
        }

        return null;
      },
    });

    expect(result.requiresConfiguration).toBe(false);
    expect(result.mods).toHaveLength(2);
    expect(result.mods[0]?.name).toBe("Core");
    expect(result.mods[0]?.enabled).toBe(true);
    expect(result.mods[0]?.isOfficial).toBe(true);
    expect(result.mods[0]?.description).toBe("Core game content");
    expect(result.mods[1]?.source).toBe("workshop");
    expect(result.mods[1]?.enabled).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns a recoverable configuration error when install path is missing", () => {
    const result = scanModLibrary(null, {
      environment: {
        platform: "linux",
        isWsl: true,
        wslDistro: "Ubuntu",
      },
      toReadablePath: () => null,
    });

    expect(result.requiresConfiguration).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.mods).toHaveLength(0);
  });

  it("keeps scanning mods when config path is missing but reports enabled-state fallback", () => {
    const sandboxRoot = mkdtempSync(join(tmpdir(), "rimun-mod-scan-"));
    const installationModsRoot = join(sandboxRoot, "installation", "Mods");

    mkdirSync(join(installationModsRoot, "Core", "About"), { recursive: true });
    writeFileSync(
      join(installationModsRoot, "Core", "About", "About.xml"),
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
        </ModMetaData>
      `,
    );

    const result = scanModLibrary(
      {
        channel: "steam",
        installationPath: "C:\\Games\\RimWorld",
        workshopPath: null,
        configPath: null,
      },
      {
        environment: {
          platform: "linux",
          isWsl: true,
          wslDistro: "Ubuntu",
        },
        toReadablePath: (windowsPath) =>
          windowsPath === "C:\\Games\\RimWorld\\Mods"
            ? installationModsRoot
            : null,
      },
    );

    expect(result.mods).toHaveLength(1);
    expect(result.mods[0]?.enabled).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});
