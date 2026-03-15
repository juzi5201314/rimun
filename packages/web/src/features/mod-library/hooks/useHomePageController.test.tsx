import { AppProviders } from "@/app/AppProviders";
import { createTestHostApi } from "@/shared/testing/createTestHostApi";
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
});
