import { AppProviders } from "@/app/AppProviders";
import { createTestHostApi } from "@/shared/testing/createTestHostApi.node";
import type { ModSourceSnapshot } from "@rimun/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { useHomePageController } from "./useHomePageController";

function createRescannedSnapshot(): ModSourceSnapshot {
  return {
    environment: {
      platform: "linux",
      isWsl: true,
      wslDistro: "Ubuntu",
    },
    selection: {
      channel: "steam",
      installationPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      configPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    },
    scannedAt: "2026-03-13T00:30:00.000Z",
    scannedRoots: {
      installationModsPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      modsConfigPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
    },
    activePackageIds: ["ludeon.rimworld", "unlimitedhugs.hugslib"],
    entries: [
      {
        entryName: "Core",
        source: "installation",
        modWindowsPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods\\Core",
        modReadablePath:
          "/mnt/c/Program Files (x86)/Steam/steamapps/common/RimWorld/Mods/Core",
        manifestPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods\\Core\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>Core</name>
            <packageId>ludeon.rimworld</packageId>
            <author>Ludeon Studios</author>
          </ModMetaData>
        `,
        notes: [],
      },
      {
        entryName: "818773962",
        source: "workshop",
        modWindowsPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\818773962",
        modReadablePath:
          "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/818773962",
        manifestPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\818773962\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>HugsLib</name>
            <packageId>unlimitedhugs.hugslib</packageId>
            <author>UnlimitedHugs</author>
          </ModMetaData>
        `,
        notes: [],
      },
    ],
    errors: [],
    requiresConfiguration: false,
  };
}

function createOptimalHarmonySnapshot(): ModSourceSnapshot {
  return {
    environment: {
      platform: "linux",
      isWsl: true,
      wslDistro: "Ubuntu",
    },
    selection: {
      channel: "steam",
      installationPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      configPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    },
    scannedAt: "2026-03-15T00:30:00.000Z",
    scannedRoots: {
      installationModsPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      modsConfigPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
    },
    activePackageIds: [
      "brrainz.harmony",
      "ludeon.rimworld",
      "oskarpotocki.vanillafactionsexpanded.core",
    ],
    entries: [
      {
        entryName: "2009463077",
        source: "workshop",
        modWindowsPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\2009463077",
        modReadablePath:
          "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/2009463077",
        manifestPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\2009463077\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>Harmony</name>
            <packageId>brrainz.harmony</packageId>
            <author>Andreas Pardeike</author>
            <loadBefore><li>ludeon.rimworld</li></loadBefore>
          </ModMetaData>
        `,
        notes: [],
      },
      {
        entryName: "Core",
        source: "installation",
        modWindowsPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods\\Core",
        modReadablePath:
          "/mnt/c/Program Files (x86)/Steam/steamapps/common/RimWorld/Mods/Core",
        manifestPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods\\Core\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>Core</name>
            <packageId>ludeon.rimworld</packageId>
            <author>Ludeon Studios</author>
          </ModMetaData>
        `,
        notes: [],
      },
      {
        entryName: "2023507013",
        source: "workshop",
        modWindowsPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\2023507013",
        modReadablePath:
          "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/2023507013",
        manifestPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\2023507013\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>Vanilla Expanded Framework</name>
            <packageId>OskarPotocki.VanillaFactionsExpanded.Core</packageId>
            <author>Vanilla Expanded</author>
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
        notes: [],
      },
    ],
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

describe("useHomePageController", () => {
  it("preserves active search and source filters when switching profiles", async () => {
    const hostApi = createTestHostApi();
    const wrapper = ({ children }: PropsWithChildren) => (
      <AppProviders hostApi={hostApi}>{children}</AppProviders>
    );
    const { result } = renderHook(() => useHomePageController(), { wrapper });

    await waitFor(() => {
      expect(result.current.currentProfileId).toBe("default");
      expect(result.current.visibleActiveMods.map((mod) => mod.name)).toEqual([
        "Core",
        "HugsLib",
      ]);
    });

    act(() => {
      result.current.setSearchQuery("e");
      result.current.setSourceFilter("workshop");
    });

    await waitFor(() => {
      expect(result.current.searchQuery).toBe("e");
      expect(result.current.sourceFilter).toBe("workshop");
      expect(result.current.visibleActiveMods.map((mod) => mod.name)).toEqual([
        "HugsLib",
      ]);
      expect(result.current.visibleInactiveMods.map((mod) => mod.name)).toEqual(
        ["Pawns"],
      );
    });

    await act(async () => {
      await result.current.handleProfileSwitch("builder");
    });

    await waitFor(() => {
      expect(result.current.currentProfileId).toBe("builder");
      expect(result.current.searchQuery).toBe("e");
      expect(result.current.sourceFilter).toBe("workshop");
      expect(result.current.visibleActiveMods.map((mod) => mod.name)).toEqual([
        "Pawns",
      ]);
      expect(result.current.visibleInactiveMods.map((mod) => mod.name)).toEqual(
        ["HugsLib"],
      );
    });
  });

  it("coalesces overlapping rescans into a single host snapshot request", async () => {
    const deferredSnapshot = createDeferred<ModSourceSnapshot>();
    let snapshotRequests = 0;
    const hostApi = createTestHostApi({
      onGetModSourceSnapshot: async ({ profileId }) => {
        snapshotRequests += 1;

        if (snapshotRequests === 1) {
          return createRescannedSnapshot();
        }

        expect(profileId).toBe("default");
        return deferredSnapshot.promise;
      },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <AppProviders hostApi={hostApi}>{children}</AppProviders>
    );
    const { result } = renderHook(() => useHomePageController(), { wrapper });

    await waitFor(() => {
      expect(result.current.currentProfileId).toBe("default");
      expect(result.current.isRescanning).toBe(false);
    });

    let firstRescan!: Promise<void>;
    let secondRescan!: Promise<void>;

    act(() => {
      firstRescan = result.current.handleRescanLibrary();
      secondRescan = result.current.handleRescanLibrary();
    });

    await waitFor(() => {
      expect(result.current.isRescanning).toBe(true);
      expect(snapshotRequests).toBe(2);
    });

    deferredSnapshot.resolve(createRescannedSnapshot());

    await act(async () => {
      await Promise.all([firstRescan, secondRescan]);
    });

    await waitFor(() => {
      expect(result.current.isRescanning).toBe(false);
      expect(snapshotRequests).toBe(2);
      expect(result.current.feedback?.message).toBe(
        "Mod library rescanned from the current configured roots.",
      );
    });
  });

  it("treats Harmony before Core as an optimal order and keeps sort actions closed", async () => {
    const hostApi = createTestHostApi({
      modSourceSnapshot: createOptimalHarmonySnapshot(),
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <AppProviders hostApi={hostApi}>{children}</AppProviders>
    );
    const { result } = renderHook(() => useHomePageController(), { wrapper });

    await waitFor(() => {
      expect(result.current.currentProfileId).toBe("default");
      expect(result.current.analysis?.hasBlockingIssues).toBe(false);
      expect(result.current.analysis?.sortDifferenceCount).toBe(0);
      expect(result.current.analysis?.isOptimal).toBe(true);
      expect(result.current.isSortDialogOpen).toBe(false);
      expect(result.current.isDependencyDialogOpen).toBe(false);
      expect(result.current.visibleActiveMods.map((mod) => mod.packageId)).toEqual(
        [
          "brrainz.harmony",
          "ludeon.rimworld",
          "OskarPotocki.VanillaFactionsExpanded.Core",
        ],
      );
    });
  });
});
