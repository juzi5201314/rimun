import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { analyzeModOrder, buildModLibraryFromSnapshot } from "@rimun/domain";
import type { ModSourceSnapshot, PathSelection } from "@rimun/shared";
import { createRimunTempDir } from "../../../shared/test/tmp-path";
import { createRimunHostService } from "./host-service";
import { SettingsRepository } from "./persistence";

function createSandboxLayout() {
  const sandboxRoot = createRimunTempDir("rimun-host-service-");
  const installationModsRoot = join(sandboxRoot, "installation", "Mods");
  const installationDataRoot = join(sandboxRoot, "installation", "Data");
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
    sandboxRoot,
    workshopRoot,
  };
}

function createSelection(
  overrides: Partial<Omit<PathSelection, "installationPath">> & {
    installationPath?: string;
  } = {},
): PathSelection & { installationPath: string } {
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

function createSnapshot(activePackageIds: string[]): ModSourceSnapshot {
  return {
    environment: {
      platform: "linux",
      isWsl: true,
      wslDistro: "Ubuntu",
    },
    selection: createSelection(),
    scannedAt: "2026-03-15T00:00:00.000Z",
    scannedRoots: {
      installationModsPath: "C:\\Games\\RimWorld\\Mods",
      workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
      modsConfigPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
    },
    gameVersion: "1.5.4104 rev435",
    currentGameLanguage: {
      folderName: "English",
      normalizedFolderName: "english",
      source: "prefs",
    },
    activePackageIds,
    entries: [],
    errors: [],
    requiresConfiguration: false,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function listRelativeFiles(root: string, currentPath = ""): string[] {
  const absolutePath = currentPath ? join(root, currentPath) : root;
  const entries = readdirSync(absolutePath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const relativePath = currentPath
      ? join(currentPath, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      return listRelativeFiles(root, relativePath);
    }

    return [relativePath];
  });
}

function isAllowlistedSqliteArtifact(filePath: string) {
  return /^rimun\.sqlite(?:-shm|-wal)?$/.test(filePath);
}

async function settleMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

const originalAppDataDirectory = process.env["RIMUN_APP_DATA_DIR"];

afterEach(() => {
  if (originalAppDataDirectory) {
    process.env["RIMUN_APP_DATA_DIR"] = originalAppDataDirectory;
    return;
  }

  delete process.env["RIMUN_APP_DATA_DIR"];
});

describe("rimun host service", () => {
  it("reuses a single in-flight mod source snapshot request per profile snapshot", async () => {
    const { configRoot } = createSandboxLayout();
    writeModsConfigXml(configRoot, ["ludeon.rimworld"]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();
    const deferredSnapshot = createDeferred<ModSourceSnapshot>();
    const snapshotStarted = createDeferred<void>();
    let firstRequest: Promise<ModSourceSnapshot> | null = null;
    let secondRequest: Promise<ModSourceSnapshot> | null = null;

    try {
      repository.saveSettings(
        createSelection({
          workshopPath: null,
        }),
      );

      let snapshotReads = 0;
      const hostService = createRimunHostService(repository, {
        readModSourceSnapshot: async () => {
          snapshotReads += 1;

          if (snapshotReads === 1) {
            snapshotStarted.resolve();
          }

          return deferredSnapshot.promise;
        },
        toReadablePath: createReadablePathResolver({ configRoot }),
      });

      firstRequest = hostService.getModSourceSnapshot({
        profileId: "default",
      });
      secondRequest = hostService.getModSourceSnapshot({
        profileId: "default",
      });

      await snapshotStarted.promise;
      await settleMicrotasks();

      expect(snapshotReads).toBe(1);

      deferredSnapshot.resolve(createSnapshot(["ludeon.rimworld"]));

      const [firstResult, secondResult] = await Promise.all([
        firstRequest,
        secondRequest,
      ]);

      expect(firstResult).toEqual(secondResult);
    } finally {
      deferredSnapshot.resolve(createSnapshot(["ludeon.rimworld"]));
      await Promise.allSettled([firstRequest, secondRequest].filter(Boolean));
      repository.close();
    }
  });

  it("does not modify ModsConfig.xml when rescanning the library", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();
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
    writeModsConfigXml(configRoot, ["ludeon.rimworld"], {
      knownExpansionIds: ["ideology"],
    });
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();
    const modsConfigPath = join(configRoot, "ModsConfig.xml");

    try {
      repository.saveSettings(
        createSelection({
          workshopPath: null,
        }),
      );

      const hostService = createRimunHostService(repository, {
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      });
      const beforeContents = readFileSync(modsConfigPath, "utf8");
      const beforeModifiedTime = statSync(modsConfigPath).mtimeMs;

      await hostService.getModSourceSnapshot({ profileId: "default" });
      await hostService.getModSourceSnapshot({ profileId: "default" });

      expect(readFileSync(modsConfigPath, "utf8")).toBe(beforeContents);
      expect(statSync(modsConfigPath).mtimeMs).toBe(beforeModifiedTime);
    } finally {
      repository.close();
    }
  });

  it("does not create persistent scan cache artifacts under the app data directory", async () => {
    const {
      configRoot,
      installationDataRoot,
      installationModsRoot,
      workshopRoot,
    } = createSandboxLayout();
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
      workshopRoot,
      "818773962",
      `
        <ModMetaData>
          <name>HugsLib</name>
          <packageId>unlimitedhugs.hugslib</packageId>
        </ModMetaData>
      `,
    );
    writeModsConfigXml(configRoot, [
      "ludeon.rimworld",
      "unlimitedhugs.hugslib",
    ]);
    const appDataDirectory = createRimunTempDir("rimun-app-data-");
    process.env["RIMUN_APP_DATA_DIR"] = appDataDirectory;

    const repository = new SettingsRepository();

    try {
      repository.saveSettings(createSelection());

      const hostService = createRimunHostService(repository, {
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
          workshopRoot,
        }),
      });

      await hostService.getProfileCatalog();

      const beforeFiles = listRelativeFiles(appDataDirectory).sort();

      await hostService.getModSourceSnapshot({ profileId: "default" });
      await hostService.getModSourceSnapshot({ profileId: "default" });

      const afterFiles = listRelativeFiles(appDataDirectory).sort();
      const newFiles = afterFiles.filter(
        (filePath) => !beforeFiles.includes(filePath),
      );

      expect(afterFiles.every(isAllowlistedSqliteArtifact)).toBe(true);
      expect(newFiles.every(isAllowlistedSqliteArtifact)).toBe(true);
    } finally {
      repository.close();
    }
  });

  it("does not restart localization analysis for the same failed snapshot", async () => {
    const { configRoot } = createSandboxLayout();
    writeModsConfigXml(configRoot, ["ludeon.rimworld"]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();
    const snapshot = createSnapshot(["ludeon.rimworld"]);
    let localizationReads = 0;

    try {
      repository.saveSettings(
        createSelection({
          workshopPath: null,
        }),
      );

      const hostService = createRimunHostService(repository, {
        readModLocalizationSnapshotForSnapshot: async () => {
          localizationReads += 1;
          throw new Error("broken localization xml");
        },
        readModSourceSnapshot: async () => snapshot,
        toReadablePath: createReadablePathResolver({ configRoot }),
      });

      await hostService.getModSourceSnapshot({
        profileId: "default",
      });

      await expect(
        hostService.getModLocalizationSnapshot({
          profileId: "default",
          snapshotScannedAt: snapshot.scannedAt,
        }),
      ).rejects.toThrow("broken localization xml");

      expect(
        await hostService.getModLocalizationProgress({
          profileId: "default",
          snapshotScannedAt: snapshot.scannedAt,
        }),
      ).toEqual({
        completedUnits: 0,
        percent: 0,
        scannedAt: snapshot.scannedAt,
        state: "unavailable",
        totalUnits: 1,
      });

      await expect(
        hostService.getModLocalizationSnapshot({
          profileId: "default",
          snapshotScannedAt: snapshot.scannedAt,
        }),
      ).rejects.toThrow("broken localization xml");

      expect(localizationReads).toBe(1);
    } finally {
      repository.close();
    }
  });

  it("keeps structured dependency metadata from corrupting package ids in host snapshots", async () => {
    const {
      configRoot,
      installationDataRoot,
      installationModsRoot,
      workshopRoot,
    } = createSandboxLayout();
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
      workshopRoot,
      "2009463077",
      `
        <ModMetaData>
          <name>Harmony</name>
          <packageId>brrainz.harmony</packageId>
          <loadBefore><li>ludeon.rimworld</li></loadBefore>
        </ModMetaData>
      `,
    );
    writeAboutXml(
      workshopRoot,
      "2023507013",
      `
        <ModMetaData>
          <name>Vanilla Expanded Framework</name>
          <packageId>OskarPotocki.VanillaFactionsExpanded.Core</packageId>
          <modDependencies>
            <li>
              <packageId>brrainz.harmony</packageId>
              <displayName>Harmony</displayName>
              <downloadUrl>https://github.com/pardeike/HarmonyRimWorld/releases/latest</downloadUrl>
              <steamWorkshopUrl>https://steamcommunity.com/workshop/filedetails/?id=2009463077</steamWorkshopUrl>
            </li>
          </modDependencies>
          <loadAfter><li>brrainz.harmony</li></loadAfter>
        </ModMetaData>
      `,
    );
    writeModsConfigXml(configRoot, [
      "brrainz.harmony",
      "ludeon.rimworld",
      "oskarpotocki.vanillafactionsexpanded.core",
    ]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();

    try {
      repository.saveSettings(createSelection());

      const hostService = createRimunHostService(repository, {
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
          workshopRoot,
        }),
      });
      const snapshot = await hostService.getModSourceSnapshot({
        profileId: "default",
      });
      const modLibrary = buildModLibraryFromSnapshot(snapshot);
      const analysis = analyzeModOrder(modLibrary);
      const modByPackageId = new Map(
        modLibrary.mods
          .filter((mod) => mod.packageId)
          .map((mod) => [mod.packageId?.toLowerCase() ?? "", mod]),
      );

      expect(modByPackageId.get("brrainz.harmony")?.name).toBe("Harmony");
      expect(
        modByPackageId.get("oskarpotocki.vanillafactionsexpanded.core")?.name,
      ).toBe("Vanilla Expanded Framework");
      expect(
        modByPackageId.get("oskarpotocki.vanillafactionsexpanded.core")
          ?.dependencyMetadata.dependencies,
      ).toEqual(["brrainz.harmony"]);
      expect(analysis.hasBlockingIssues).toBe(false);
      expect(snapshot.activePackageIds).toEqual([
        "ludeon.rimworld",
        "brrainz.harmony",
        "oskarpotocki.vanillafactionsexpanded.core",
      ]);
      expect(analysis.sortDifferenceCount).toBe(2);
      expect(analysis.recommendedOrderPackageIds).toEqual([
        "brrainz.harmony",
        "ludeon.rimworld",
        "oskarpotocki.vanillafactionsexpanded.core",
      ]);
    } finally {
      repository.close();
    }
  });
});
