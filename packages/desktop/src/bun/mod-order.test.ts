import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PathSelection } from "@rimun/shared";
import { analyzeModOrder, applyModOrderRecommendation } from "./mod-order";
import { scanModLibrary } from "./mods";

function createSandbox() {
  const sandboxRoot = mkdtempSync(join(tmpdir(), "rimun-mod-order-"));
  const installationModsRoot = join(sandboxRoot, "installation", "Mods");
  const workshopRoot = join(sandboxRoot, "workshop");
  const configRoot = join(sandboxRoot, "config");

  mkdirSync(installationModsRoot, { recursive: true });
  mkdirSync(workshopRoot, { recursive: true });
  mkdirSync(configRoot, { recursive: true });

  return {
    installationModsRoot,
    workshopRoot,
    configRoot,
  };
}

function createSelection(): PathSelection {
  return {
    channel: "steam",
    installationPath: "C:\\Games\\RimWorld",
    workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
    configPath:
      "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
  };
}

function createReadablePathResolver(
  installationModsRoot: string,
  workshopRoot: string,
  configRoot: string,
) {
  return (windowsPath: string) => {
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
  };
}

function writeAboutXml(root: string, folder: string, xml: string) {
  mkdirSync(join(root, folder, "About"), { recursive: true });
  writeFileSync(join(root, folder, "About", "About.xml"), xml);
}

describe("mod order analyzer", () => {
  it("detects installed inactive dependencies and recommends enabling them", () => {
    const sandbox = createSandbox();

    writeAboutXml(
      sandbox.installationModsRoot,
      "Core",
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      sandbox.workshopRoot,
      "HugsLib",
      `
        <ModMetaData>
          <name>HugsLib</name>
          <packageId>unlimitedhugs.hugslib</packageId>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      sandbox.workshopRoot,
      "CameraPlus",
      `
        <ModMetaData>
          <name>Camera+</name>
          <packageId>example.camera</packageId>
          <modDependencies>
            <li>unlimitedhugs.hugslib</li>
          </modDependencies>
        </ModMetaData>
      `,
    );
    writeFileSync(
      join(sandbox.configRoot, "ModsConfig.xml"),
      `
        <ModsConfigData>
          <activeMods>
            <li>ludeon.rimworld</li>
            <li>example.camera</li>
          </activeMods>
        </ModsConfigData>
      `,
    );

    const modLibrary = scanModLibrary(createSelection(), {
      environment: {
        platform: "linux",
        isWsl: true,
        wslDistro: "Ubuntu",
      },
      toReadablePath: createReadablePathResolver(
        sandbox.installationModsRoot,
        sandbox.workshopRoot,
        sandbox.configRoot,
      ),
    });
    const analysis = analyzeModOrder(modLibrary);

    expect(analysis.isOptimal).toBe(false);
    expect(analysis.hasBlockingIssues).toBe(false);
    expect(analysis.missingInstalledInactiveDependencies).toEqual([
      {
        packageId: "unlimitedhugs.hugslib",
        modName: "HugsLib",
        requiredByPackageIds: ["example.camera"],
        requiredByNames: ["Camera+"],
      },
    ]);
    expect(analysis.recommendedActivePackageIds).toEqual([
      "ludeon.rimworld",
      "example.camera",
      "unlimitedhugs.hugslib",
    ]);
    expect(analysis.recommendedOrderPackageIds).toEqual([
      "ludeon.rimworld",
      "unlimitedhugs.hugslib",
      "example.camera",
    ]);
  });

  it("reports unavailable dependencies as blocking issues", () => {
    const sandbox = createSandbox();

    writeAboutXml(
      sandbox.installationModsRoot,
      "Core",
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      sandbox.workshopRoot,
      "CombatTweaks",
      `
        <ModMetaData>
          <name>Combat Tweaks</name>
          <packageId>example.combat</packageId>
          <modDependencies>
            <li>missing.foundation</li>
          </modDependencies>
        </ModMetaData>
      `,
    );
    writeFileSync(
      join(sandbox.configRoot, "ModsConfig.xml"),
      `
        <ModsConfigData>
          <activeMods>
            <li>ludeon.rimworld</li>
            <li>example.combat</li>
          </activeMods>
        </ModsConfigData>
      `,
    );

    const modLibrary = scanModLibrary(createSelection(), {
      environment: {
        platform: "linux",
        isWsl: true,
        wslDistro: "Ubuntu",
      },
      toReadablePath: createReadablePathResolver(
        sandbox.installationModsRoot,
        sandbox.workshopRoot,
        sandbox.configRoot,
      ),
    });
    const analysis = analyzeModOrder(modLibrary);

    expect(analysis.hasBlockingIssues).toBe(true);
    expect(analysis.missingUnavailableDependencies).toEqual([
      {
        packageId: "missing.foundation",
        modName: null,
        requiredByPackageIds: ["example.combat"],
        requiredByNames: ["Combat Tweaks"],
      },
    ]);
    expect(
      analysis.diagnostics.some(
        (diagnostic) => diagnostic.code === "missing_unavailable_dependency",
      ),
    ).toBe(true);
  });

  it("detects dependency cycles", () => {
    const sandbox = createSandbox();

    writeAboutXml(
      sandbox.installationModsRoot,
      "Core",
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      sandbox.workshopRoot,
      "Alpha",
      `
        <ModMetaData>
          <name>Alpha</name>
          <packageId>example.alpha</packageId>
          <loadAfter>
            <li>example.beta</li>
          </loadAfter>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      sandbox.workshopRoot,
      "Beta",
      `
        <ModMetaData>
          <name>Beta</name>
          <packageId>example.beta</packageId>
          <loadAfter>
            <li>example.alpha</li>
          </loadAfter>
        </ModMetaData>
      `,
    );
    writeFileSync(
      join(sandbox.configRoot, "ModsConfig.xml"),
      `
        <ModsConfigData>
          <activeMods>
            <li>ludeon.rimworld</li>
            <li>example.alpha</li>
            <li>example.beta</li>
          </activeMods>
        </ModsConfigData>
      `,
    );

    const modLibrary = scanModLibrary(createSelection(), {
      environment: {
        platform: "linux",
        isWsl: true,
        wslDistro: "Ubuntu",
      },
      toReadablePath: createReadablePathResolver(
        sandbox.installationModsRoot,
        sandbox.workshopRoot,
        sandbox.configRoot,
      ),
    });
    const analysis = analyzeModOrder(modLibrary);

    expect(analysis.hasBlockingIssues).toBe(true);
    expect(
      analysis.diagnostics.some(
        (diagnostic) => diagnostic.code === "cycle_detected",
      ),
    ).toBe(true);
  });

  it("writes enabled dependencies and recommended order back to ModsConfig.xml", () => {
    const sandbox = createSandbox();
    const selection = createSelection();
    const toReadablePath = createReadablePathResolver(
      sandbox.installationModsRoot,
      sandbox.workshopRoot,
      sandbox.configRoot,
    );

    writeAboutXml(
      sandbox.installationModsRoot,
      "Core",
      `
        <ModMetaData>
          <name>Core</name>
          <packageId>ludeon.rimworld</packageId>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      sandbox.workshopRoot,
      "HugsLib",
      `
        <ModMetaData>
          <name>HugsLib</name>
          <packageId>unlimitedhugs.hugslib</packageId>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      sandbox.workshopRoot,
      "CameraPlus",
      `
        <ModMetaData>
          <name>Camera+</name>
          <packageId>example.camera</packageId>
          <modDependencies>
            <li>unlimitedhugs.hugslib</li>
          </modDependencies>
        </ModMetaData>
      `,
    );
    writeFileSync(
      join(sandbox.configRoot, "ModsConfig.xml"),
      `
        <ModsConfigData>
          <activeMods>
            <li>ludeon.rimworld</li>
            <li>example.camera</li>
          </activeMods>
          <knownExpansions>
            <li>ideology</li>
          </knownExpansions>
        </ModsConfigData>
      `,
    );

    const enableResult = applyModOrderRecommendation(
      selection,
      {
        actions: ["enableMissingDependencies"],
      },
      {
        environment: {
          platform: "linux",
          isWsl: true,
          wslDistro: "Ubuntu",
        },
        toReadablePath,
      },
    );

    expect(enableResult.activePackageIds).toEqual([
      "ludeon.rimworld",
      "example.camera",
      "unlimitedhugs.hugslib",
    ]);

    const reorderResult = applyModOrderRecommendation(
      selection,
      {
        actions: ["reorderActiveMods"],
      },
      {
        environment: {
          platform: "linux",
          isWsl: true,
          wslDistro: "Ubuntu",
        },
        toReadablePath,
      },
    );

    expect(reorderResult.activePackageIds).toEqual([
      "ludeon.rimworld",
      "unlimitedhugs.hugslib",
      "example.camera",
    ]);

    const savedXml = readFileSync(
      join(sandbox.configRoot, "ModsConfig.xml"),
      "utf8",
    );

    expect(savedXml).toContain("<knownExpansions>");
    expect(savedXml).toContain("<li>unlimitedhugs.hugslib</li>");
    expect(savedXml.indexOf("unlimitedhugs.hugslib")).toBeLessThan(
      savedXml.indexOf("example.camera"),
    );
  });
});
