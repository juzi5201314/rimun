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
import type {
  ModLocalizationSnapshot,
  ModSourceSnapshot,
  PathSelection,
} from "@rimun/shared";
import { createRimunTempDir } from "../../../shared/test/tmp-path";
import {
  createRimunHostService,
  resetHostServiceBackgroundStateForTests,
} from "./host-service";
import {
  getModLocalizationSessionDebugStateForTests,
  getModLocalizationPerfStatsForTests,
  resetModLocalizationPerfStateForTests,
} from "./mod-localization";
import {
  readModLocalizationSnapshotForSnapshot,
  readModSourceSnapshot,
} from "./mods";
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

    if (
      paths.configRoot &&
      windowsPath ===
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\Prefs.xml"
    ) {
      return join(paths.configRoot, "Prefs.xml");
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

function writePrefs(configRoot: string, folderName = "ChineseSimplified") {
  writeFileSync(
    join(configRoot, "Prefs.xml"),
    `<Prefs><langFolderName>${folderName}</langFolderName></Prefs>`,
  );
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

async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 1_000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }

    await Bun.sleep(5);
  }

  throw new Error("Timed out waiting for condition.");
}

const originalAppDataDirectory = process.env["RIMUN_APP_DATA_DIR"];

afterEach(() => {
  resetHostServiceBackgroundStateForTests();
  resetModLocalizationPerfStateForTests();
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

      expect({
        ...firstResult,
        scannedAt: secondResult.scannedAt,
      }).toEqual(secondResult);
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

  it("omits raw About.xml text from the public mod source snapshot payload", async () => {
    const {
      configRoot,
      installationDataRoot,
      installationModsRoot,
      workshopRoot,
    } = createSandboxLayout();
    writeModsConfigXml(configRoot, ["example.camera"]);
    writeAboutXml(
      installationModsRoot,
      "CameraPlus",
      `
        <ModMetaData>
          <name>Camera+</name>
          <packageId>example.camera</packageId>
          <author>Tester</author>
        </ModMetaData>
      `,
    );
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

      expect(snapshot.entries).toHaveLength(1);
      expect(snapshot.entries[0]?.aboutXmlText).toBeUndefined();
      expect(snapshot.entries[0]?.manifestMetadata?.packageId).toBe(
        "example.camera",
      );
    } finally {
      repository.close();
    }
  });

  it("loads the profile catalog without rereading ModsConfig once profiles exist", async () => {
    const {
      configRoot,
      installationDataRoot,
      installationModsRoot,
      workshopRoot,
    } = createSandboxLayout();
    writeModsConfigXml(configRoot, ["ludeon.rimworld"]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();

    try {
      repository.saveSettings(createSelection());
      const initialHostService = createRimunHostService(repository, {
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
          workshopRoot,
        }),
      });

      await initialHostService.getProfileCatalog();

      const cachedCatalogHostService = createRimunHostService(repository, {
        toReadablePath: () => null,
      });
      const catalog = await cachedCatalogHostService.getProfileCatalog();

      expect(catalog.currentProfileId).toBe("default");
      expect(catalog.profiles.map((profile) => profile.id)).toContain(
        "default",
      );
    } finally {
      repository.close();
    }
  });

  it("reuses the latest snapshot when watched roots stay unchanged", async () => {
    const { configRoot } = createSandboxLayout();
    writeModsConfigXml(configRoot, ["ludeon.rimworld"]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();
    let snapshotReads = 0;

    try {
      repository.saveSettings(
        createSelection({
          workshopPath: null,
        }),
      );

      const hostService = createRimunHostService(repository, {
        readModSourceSnapshot: async () => {
          snapshotReads += 1;
          return createSnapshot(["ludeon.rimworld"]);
        },
        toReadablePath: createReadablePathResolver({ configRoot }),
      });

      const firstSnapshot = await hostService.getModSourceSnapshot({
        profileId: "default",
      });
      const secondSnapshot = await hostService.getModSourceSnapshot({
        profileId: "default",
      });

      expect(snapshotReads).toBe(1);
      expect(secondSnapshot.scannedAt).not.toBe(firstSnapshot.scannedAt);
      expect({
        ...secondSnapshot,
        scannedAt: firstSnapshot.scannedAt,
      }).toEqual(firstSnapshot);
    } finally {
      repository.close();
    }
  });

  it("reuses the latest localization snapshot when refreshed inputs stay clean", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();
    writePrefs(configRoot);
    const aboutXmlText = `
        <ModMetaData>
          <name>TranslatorMod</name>
          <packageId>example.translator</packageId>
        </ModMetaData>
      `;
    writeAboutXml(installationModsRoot, "TranslatorMod", aboutXmlText);
    writeKeyedXml(
      installationModsRoot,
      "TranslatorMod",
      "English",
      "TranslatorMod.xml",
      [{ key: "TranslatorMod.Hello", value: "Hello" }],
    );
    writeKeyedXml(
      installationModsRoot,
      "TranslatorMod",
      "ChineseSimplified",
      "TranslatorMod.xml",
      [{ key: "TranslatorMod.Hello", value: "你好" }],
    );
    writeModsConfigXml(configRoot, ["example.translator"]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();
    let snapshotReads = 0;

    try {
      repository.saveSettings(
        createSelection({
          workshopPath: null,
        }),
      );
      resetModLocalizationPerfStateForTests();

      const hostService = createRimunHostService(repository, {
        readModSourceSnapshot: async (selection, options) => {
          snapshotReads += 1;
          return readModSourceSnapshot(selection, options);
        },
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      });
      const firstSnapshot = await hostService.getModSourceSnapshot({
        profileId: "default",
      });
      const firstLocalization = await hostService.getModLocalizationSnapshot({
        profileId: "default",
        snapshotScannedAt: firstSnapshot.scannedAt,
      });
      const firstStats = getModLocalizationPerfStatsForTests();
      writeAboutXml(installationModsRoot, "TranslatorMod", aboutXmlText);
      let secondSnapshot: ModSourceSnapshot | null = null;

      await waitForCondition(async () => {
        const nextSnapshot = await hostService.getModSourceSnapshot({
          profileId: "default",
        });

        if (snapshotReads < 2) {
          return false;
        }

        secondSnapshot = nextSnapshot;
        return true;
      });

      if (secondSnapshot === null) {
        throw new Error("Expected the refreshed snapshot to be captured.");
      }

      const refreshedSnapshot: ModSourceSnapshot = secondSnapshot;

      const secondLocalization = await hostService.getModLocalizationSnapshot({
        profileId: "default",
        snapshotScannedAt: refreshedSnapshot.scannedAt,
      });
      const secondStats = getModLocalizationPerfStatsForTests();

      expect(refreshedSnapshot.scannedAt).not.toBe(firstSnapshot.scannedAt);
      expect(snapshotReads).toBe(2);
      expect({
        ...secondLocalization,
        scannedAt: firstLocalization.scannedAt,
      }).toEqual(firstLocalization);
      expect(secondStats.descriptorCacheMisses).toBe(
        firstStats.descriptorCacheMisses,
      );
      expect(secondStats.defsCacheMisses).toBe(firstStats.defsCacheMisses);
    } finally {
      repository.close();
    }
  });

  it("reruns localization analysis instead of carrying forward dirty session state", async () => {
    const { configRoot, installationDataRoot, installationModsRoot } =
      createSandboxLayout();
    writePrefs(configRoot);
    const aboutXmlText = `
        <ModMetaData>
          <name>TranslatorMod</name>
          <packageId>example.translator</packageId>
        </ModMetaData>
      `;
    writeAboutXml(installationModsRoot, "TranslatorMod", aboutXmlText);
    writeKeyedXml(
      installationModsRoot,
      "TranslatorMod",
      "English",
      "TranslatorMod.xml",
      [{ key: "TranslatorMod.Hello", value: "Hello" }],
    );
    writeKeyedXml(
      installationModsRoot,
      "TranslatorMod",
      "ChineseSimplified",
      "TranslatorMod.xml",
      [{ key: "TranslatorMod.Hello", value: "你好" }],
    );
    writeModsConfigXml(configRoot, ["example.translator"]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();
    let localizationReads = 0;
    const translatorModPath = join(installationModsRoot, "TranslatorMod");

    try {
      repository.saveSettings(
        createSelection({
          workshopPath: null,
        }),
      );

      const hostService = createRimunHostService(repository, {
        readModLocalizationSnapshotForSnapshot: async (snapshot, options) => {
          localizationReads += 1;
          return readModLocalizationSnapshotForSnapshot(snapshot, options);
        },
        toReadablePath: createReadablePathResolver({
          configRoot,
          installationDataRoot,
          installationModsRoot,
        }),
      });
      const firstSnapshot = await hostService.getModSourceSnapshot({
        profileId: "default",
      });

      await hostService.getModLocalizationSnapshot({
        profileId: "default",
        snapshotScannedAt: firstSnapshot.scannedAt,
      });

      writeKeyedXml(
        installationModsRoot,
        "TranslatorMod",
        "ChineseSimplified",
        "TranslatorMod.xml",
        [{ key: "TranslatorMod.Hello", value: "您好" }],
      );

      await waitForCondition(() => {
        const [debugState] = getModLocalizationSessionDebugStateForTests([
          translatorModPath,
        ]);
        return debugState?.languagesDirty === true;
      });

      const secondSnapshot = await hostService.getModSourceSnapshot({
        profileId: "default",
      });

      await hostService.getModLocalizationSnapshot({
        profileId: "default",
        snapshotScannedAt: secondSnapshot.scannedAt,
      });

      expect(localizationReads).toBe(2);
    } finally {
      repository.close();
    }
  });

  it("bridges an in-flight localization request to the refreshed snapshot", async () => {
    const { configRoot } = createSandboxLayout();
    writeModsConfigXml(configRoot, ["ludeon.rimworld"]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();
    const deferredLocalization = createDeferred<ModLocalizationSnapshot>();
    const localizationStarted = createDeferred<void>();
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
          localizationStarted.resolve();
          return deferredLocalization.promise;
        },
        readModSourceSnapshot: async () => createSnapshot(["ludeon.rimworld"]),
        toReadablePath: createReadablePathResolver({ configRoot }),
      });
      const firstSnapshot = await hostService.getModSourceSnapshot({
        profileId: "default",
      });
      const firstLocalizationPromise = hostService.getModLocalizationSnapshot({
        profileId: "default",
        snapshotScannedAt: firstSnapshot.scannedAt,
      });

      await localizationStarted.promise;
      await settleMicrotasks();

      const secondSnapshot = await hostService.getModSourceSnapshot({
        profileId: "default",
      });
      const secondLocalizationPromise = hostService.getModLocalizationSnapshot({
        profileId: "default",
        snapshotScannedAt: secondSnapshot.scannedAt,
      });

      deferredLocalization.resolve({
        currentGameLanguage: {
          folderName: "English",
          normalizedFolderName: "english",
          source: "prefs",
        },
        entries: [],
        scannedAt: firstSnapshot.scannedAt,
      });

      const [firstLocalization, secondLocalization] = await Promise.all([
        firstLocalizationPromise,
        secondLocalizationPromise,
      ]);

      expect(localizationReads).toBe(1);
      expect(firstLocalization.scannedAt).toBe(firstSnapshot.scannedAt);
      expect(secondLocalization.scannedAt).toBe(secondSnapshot.scannedAt);
    } finally {
      repository.close();
    }
  });

  it("does not reuse a stale snapshot context after settings change mid-request", async () => {
    const { configRoot } = createSandboxLayout();
    const nextConfigRoot = createRimunTempDir("rimun-host-service-config-");
    writeModsConfigXml(configRoot, ["ludeon.rimworld"]);
    writeModsConfigXml(nextConfigRoot, ["example.changed"]);
    process.env["RIMUN_APP_DATA_DIR"] = createRimunTempDir("rimun-app-data-");

    const repository = new SettingsRepository();
    const releaseFirstRead = createDeferred<void>();
    const firstReadStarted = createDeferred<void>();
    let snapshotReads = 0;

    try {
      repository.saveSettings(
        createSelection({
          configPath:
            "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
          workshopPath: null,
        }),
      );

      const hostService = createRimunHostService(repository, {
        readModSourceSnapshot: async (selection) => {
          snapshotReads += 1;

          if (snapshotReads === 1) {
            firstReadStarted.resolve();
            await releaseFirstRead.promise;
          }

          return createSnapshot(
            selection?.configPath?.includes("ChangedConfig")
              ? ["example.changed"]
              : ["ludeon.rimworld"],
          );
        },
        toReadablePath: (windowsPath) => {
          if (
            windowsPath ===
            "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml"
          ) {
            return join(configRoot, "ModsConfig.xml");
          }

          if (windowsPath === "C:\\ChangedConfig\\ModsConfig.xml") {
            return join(nextConfigRoot, "ModsConfig.xml");
          }

          return null;
        },
      });
      const firstSnapshotPromise = hostService.getModSourceSnapshot({
        profileId: "default",
      });

      await firstReadStarted.promise;

      await hostService.saveSettings(
        createSelection({
          configPath: "C:\\ChangedConfig",
          workshopPath: null,
        }),
      );

      const secondSnapshotPromise = hostService.getModSourceSnapshot({
        profileId: "default",
      });
      const secondSnapshot = await secondSnapshotPromise;

      releaseFirstRead.resolve(undefined);
      const firstSnapshot = await firstSnapshotPromise;

      expect(snapshotReads).toBe(2);
      expect(secondSnapshot.activePackageIds).toEqual(["example.changed"]);
      expect(firstSnapshot.activePackageIds).toEqual(["ludeon.rimworld"]);
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
