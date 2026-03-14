import { describe, expect, it } from "bun:test";
import type { ModSourceSnapshot } from "@rimun/shared";
import { rimunTmpPath } from "../../shared/test/tmp-path";
import {
  analyzeModOrder,
  buildModLibraryFromSnapshot,
  parseAboutXml,
  parseModsConfigXml,
  replaceActiveModsBlock,
  resolveRecommendedActivePackageIds,
} from "../src/index";

function createSnapshot(activePackageIds: string[]): ModSourceSnapshot {
  const installationReadablePath = rimunTmpPath("installation", "Mods", "Core");
  const workshopHugsLibReadablePath = rimunTmpPath("workshop", "818773962");
  const workshopPawnsReadablePath = rimunTmpPath("workshop", "999999999");

  return {
    environment: {
      platform: "linux",
      isWsl: true,
      wslDistro: "Ubuntu",
    },
    selection: {
      channel: "steam",
      installationPath: "C:\\Games\\RimWorld",
      workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    },
    scannedAt: "2026-03-13T00:00:00.000Z",
    scannedRoots: {
      installationModsPath: "C:\\Games\\RimWorld\\Mods",
      workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
      modsConfigPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
    },
    activePackageIds,
    entries: [
      {
        entryName: "Core",
        source: "installation",
        modWindowsPath: "C:\\Games\\RimWorld\\Mods\\Core",
        modReadablePath: installationReadablePath,
        manifestPath: "C:\\Games\\RimWorld\\Mods\\Core\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>Core</name>
            <packageId>ludeon.rimworld</packageId>
            <author>Ludeon Studios</author>
            <modVersion>1.5.4062</modVersion>
          </ModMetaData>
        `,
        notes: [],
      },
      {
        entryName: "HugsLib",
        source: "workshop",
        modWindowsPath:
          "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100\\818773962",
        modReadablePath: workshopHugsLibReadablePath,
        manifestPath:
          "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100\\818773962\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>HugsLib</name>
            <packageId>unlimitedhugs.hugslib</packageId>
            <author>UnlimitedHugs</author>
            <supportedVersions><li>1.5</li></supportedVersions>
          </ModMetaData>
        `,
        notes: [],
      },
      {
        entryName: "Pawns",
        source: "workshop",
        modWindowsPath:
          "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100\\999999999",
        modReadablePath: workshopPawnsReadablePath,
        manifestPath:
          "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100\\999999999\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>Pawns</name>
            <packageId>example.pawns</packageId>
            <author>Storyteller</author>
            <supportedVersions><li>1.5</li></supportedVersions>
            <modDependencies><li>unlimitedhugs.hugslib</li></modDependencies>
          </ModMetaData>
        `,
        notes: [],
      },
    ],
    errors: [],
    requiresConfiguration: false,
  };
}

describe("domain xml helpers", () => {
  it("parses About.xml fields", () => {
    const parsed = parseAboutXml(`
      <ModMetaData>
        <name>Core</name>
        <packageId>ludeon.rimworld</packageId>
        <author>Ludeon Studios</author>
        <supportedVersions><li>1.5</li></supportedVersions>
      </ModMetaData>
    `);

    expect(parsed.name).toBe("Core");
    expect(parsed.packageId).toBe("ludeon.rimworld");
    expect(parsed.version).toBe("1.5");
  });

  it("merges known expansions from ModsConfig.xml", () => {
    const parsed = parseModsConfigXml(`
      <ModsConfigData>
        <activeMods>
          <li>ludeon.rimworld</li>
        </activeMods>
        <knownExpansions>
          <li>ideology</li>
        </knownExpansions>
      </ModsConfigData>
    `);

    expect(parsed.activePackageIdsOrdered).toEqual([
      "ludeon.rimworld",
      "ludeon.rimworld.ideology",
    ]);
  });

  it("writes DLC back into knownExpansions", () => {
    const xml = replaceActiveModsBlock(
      `
        <ModsConfigData>
          <activeMods />
          <knownExpansions />
        </ModsConfigData>
      `,
      ["ludeon.rimworld", "ludeon.rimworld.ideology", "example.mod"],
    );

    expect(xml).toContain("<li>example.mod</li>");
    expect(xml).toContain("<li>ideology</li>");
    expect(xml).not.toContain("<li>ludeon.rimworld.ideology</li>");
  });
});

describe("domain mod derivation", () => {
  it("builds a mod library from a source snapshot", () => {
    const library = buildModLibraryFromSnapshot(
      createSnapshot(["ludeon.rimworld", "unlimitedhugs.hugslib"]),
    );

    expect(library.mods).toHaveLength(3);
    expect(library.mods[0]?.name).toBe("Core");
    expect(library.mods[1]?.name).toBe("HugsLib");
    expect(library.mods[1]?.enabled).toBe(true);
    expect(library.mods[2]?.enabled).toBe(false);
  });

  it("analyzes dependencies and computes recommended actions", () => {
    const library = buildModLibraryFromSnapshot(
      createSnapshot(["ludeon.rimworld", "example.pawns"]),
    );
    const analysis = analyzeModOrder(library);

    expect(analysis.missingInstalledInactiveDependencies).toHaveLength(1);
    expect(analysis.recommendedActivePackageIds).toEqual([
      "ludeon.rimworld",
      "example.pawns",
      "unlimitedhugs.hugslib",
    ]);
    expect(
      resolveRecommendedActivePackageIds(analysis, [
        "enableMissingDependencies",
        "reorderActiveMods",
      ]),
    ).toEqual(["ludeon.rimworld", "unlimitedhugs.hugslib", "example.pawns"]);
  });

  it("reports unavailable dependencies as blocking issues", () => {
    const library = buildModLibraryFromSnapshot({
      ...createSnapshot(["ludeon.rimworld", "example.pawns"]),
      entries: createSnapshot(["ludeon.rimworld", "example.pawns"]).entries.map(
        (entry) =>
          entry.entryName === "Pawns"
            ? {
                ...entry,
                aboutXmlText: `
                  <ModMetaData>
                    <name>Pawns</name>
                    <packageId>example.pawns</packageId>
                    <author>Storyteller</author>
                    <supportedVersions><li>1.5</li></supportedVersions>
                    <modDependencies><li>missing.foundation</li></modDependencies>
                  </ModMetaData>
                `,
              }
            : entry,
      ),
    });
    const analysis = analyzeModOrder(library);

    expect(analysis.hasBlockingIssues).toBe(true);
    expect(analysis.missingUnavailableDependencies).toEqual([
      {
        packageId: "missing.foundation",
        modName: null,
        requiredByPackageIds: ["example.pawns"],
        requiredByNames: ["Pawns"],
      },
    ]);
    expect(
      analysis.diagnostics.some(
        (diagnostic) => diagnostic.code === "missing_unavailable_dependency",
      ),
    ).toBe(true);
  });

  it("detects dependency cycles and blocks reorder recommendations", () => {
    const snapshot = createSnapshot([
      "ludeon.rimworld",
      "example.alpha",
      "example.beta",
    ]);
    const [coreEntry] = snapshot.entries;

    if (!coreEntry) {
      throw new Error("Expected the snapshot to contain the Core entry.");
    }

    const library = buildModLibraryFromSnapshot({
      ...snapshot,
      entries: [
        coreEntry,
        {
          entryName: "Alpha",
          source: "workshop",
          modWindowsPath:
            "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100\\111111111",
          modReadablePath: rimunTmpPath("workshop", "111111111"),
          manifestPath:
            "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100\\111111111\\About\\About.xml",
          hasAboutXml: true,
          aboutXmlText: `
            <ModMetaData>
              <name>Alpha</name>
              <packageId>example.alpha</packageId>
              <loadAfter><li>example.beta</li></loadAfter>
            </ModMetaData>
          `,
          notes: [],
        },
        {
          entryName: "Beta",
          source: "workshop",
          modWindowsPath:
            "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100\\222222222",
          modReadablePath: rimunTmpPath("workshop", "222222222"),
          manifestPath:
            "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100\\222222222\\About\\About.xml",
          hasAboutXml: true,
          aboutXmlText: `
            <ModMetaData>
              <name>Beta</name>
              <packageId>example.beta</packageId>
              <loadAfter><li>example.alpha</li></loadAfter>
            </ModMetaData>
          `,
          notes: [],
        },
      ],
    });
    const analysis = analyzeModOrder(library);

    expect(analysis.hasBlockingIssues).toBe(true);
    expect(
      analysis.diagnostics.some(
        (diagnostic) => diagnostic.code === "cycle_detected",
      ),
    ).toBe(true);
    expect(() =>
      resolveRecommendedActivePackageIds(analysis, ["reorderActiveMods"]),
    ).toThrow("Cannot reorder mods while blocking issues remain.");
  });

  it("reorders active mods without enabling new dependencies when only sorting is requested", () => {
    const library = buildModLibraryFromSnapshot(
      createSnapshot([
        "ludeon.rimworld",
        "unlimitedhugs.hugslib",
        "example.pawns",
      ]),
    );
    const analysis = analyzeModOrder(library);

    expect(analysis.hasBlockingIssues).toBe(false);
    expect(analysis.sortDifferenceCount).toBe(0);
    expect(
      resolveRecommendedActivePackageIds(analysis, ["reorderActiveMods"]),
    ).toEqual(["ludeon.rimworld", "unlimitedhugs.hugslib", "example.pawns"]);
  });
});
