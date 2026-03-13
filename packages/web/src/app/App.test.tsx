import { App } from "@/app/App";
import { createMockRpcClient } from "@/shared/testing/createMockRpcClient";
import type {
  DetectPathsInput,
  ModLibraryResult,
  ModOrderAnalysisResult,
  ModOrderApplyResult,
} from "@rimun/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

function createDependencyMetadata(
  packageId: string | null,
  dependencies: string[] = [],
) {
  return {
    packageIdNormalized: packageId,
    dependencies,
    loadAfter: [],
    loadBefore: [],
    forceLoadAfter: [],
    forceLoadBefore: [],
    incompatibleWith: [],
    supportedVersions: [],
  };
}

describe("App", () => {
  it("renders the real mod library returned by the backend", async () => {
    window.__RIMUN_RPC__ = createMockRpcClient();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Core").length).toBeGreaterThan(0);
    expect(screen.getByText("HugsLib")).toBeInTheDocument();
    expect(screen.getAllByText("Enabled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pawns").length).toBeGreaterThan(0);
  });

  it("enables missing dependencies first and then offers automatic sorting", async () => {
    const modLibraryState: ModLibraryResult = {
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
          "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
      },
      scannedAt: "2026-03-12T00:00:00.000Z",
      scannedRoots: {
        installationModsPath: "C:\\Games\\RimWorld\\Mods",
        workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
        modsConfigPath:
          "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
      },
      activePackageIds: ["ludeon.rimworld", "example.camera"],
      mods: [
        {
          id: "installation:ludeon.rimworld",
          name: "Core",
          packageId: "ludeon.rimworld",
          author: "Ludeon Studios",
          version: "1.5",
          description: "Core",
          source: "installation",
          windowsPath: "C:\\Games\\RimWorld\\Mods\\Core",
          wslPath: "/mnt/c/Games/RimWorld/Mods/Core",
          manifestPath: "C:\\Games\\RimWorld\\Mods\\Core\\About\\About.xml",
          enabled: true,
          isOfficial: true,
          hasAboutXml: true,
          dependencyMetadata: createDependencyMetadata("ludeon.rimworld"),
          notes: [],
        },
        {
          id: "workshop:unlimitedhugs.hugslib",
          name: "HugsLib",
          packageId: "unlimitedhugs.hugslib",
          author: "UnlimitedHugs",
          version: "1.5",
          description: "Library helpers",
          source: "workshop",
          windowsPath: "C:\\Workshop\\HugsLib",
          wslPath: "/mnt/c/Workshop/HugsLib",
          manifestPath: "C:\\Workshop\\HugsLib\\About\\About.xml",
          enabled: false,
          isOfficial: false,
          hasAboutXml: true,
          dependencyMetadata: createDependencyMetadata("unlimitedhugs.hugslib"),
          notes: [],
        },
        {
          id: "workshop:example.camera",
          name: "Camera+",
          packageId: "example.camera",
          author: "Camera Team",
          version: "1.5",
          description: "Camera tweaks",
          source: "workshop",
          windowsPath: "C:\\Workshop\\CameraPlus",
          wslPath: "/mnt/c/Workshop/CameraPlus",
          manifestPath: "C:\\Workshop\\CameraPlus\\About\\About.xml",
          enabled: true,
          isOfficial: false,
          hasAboutXml: true,
          dependencyMetadata: createDependencyMetadata("example.camera", [
            "unlimitedhugs.hugslib",
          ]),
          notes: [],
        },
      ],
      errors: [],
      requiresConfiguration: false,
    };
    let analysisState: ModOrderAnalysisResult = {
      analyzedAt: "2026-03-12T00:00:01.000Z",
      currentActivePackageIds: ["ludeon.rimworld", "example.camera"],
      recommendedActivePackageIds: [
        "ludeon.rimworld",
        "example.camera",
        "unlimitedhugs.hugslib",
      ],
      recommendedOrderPackageIds: [
        "ludeon.rimworld",
        "unlimitedhugs.hugslib",
        "example.camera",
      ],
      missingInstalledInactiveDependencies: [
        {
          packageId: "unlimitedhugs.hugslib",
          modName: "HugsLib",
          requiredByPackageIds: ["example.camera"],
          requiredByNames: ["Camera+"],
        },
      ],
      missingUnavailableDependencies: [],
      diagnostics: [],
      explanations: [],
      edges: [],
      isOptimal: false,
      hasBlockingIssues: false,
      sortDifferenceCount: 1,
    };
    const appliedActions: ModOrderApplyResult["appliedActions"][] = [];

    window.__RIMUN_RPC__ = createMockRpcClient({
      modLibrary: modLibraryState,
      modOrderAnalysis: analysisState,
      onAnalyzeModOrder: async () => analysisState,
      onApplyModOrderRecommendation: async (input) => {
        appliedActions.push(input.actions);

        if (input.actions.includes("enableMissingDependencies")) {
          modLibraryState.activePackageIds = [
            "ludeon.rimworld",
            "example.camera",
            "unlimitedhugs.hugslib",
          ];
          modLibraryState.mods = modLibraryState.mods.map((mod) =>
            mod.packageId === "unlimitedhugs.hugslib"
              ? { ...mod, enabled: true }
              : mod,
          );
          analysisState = {
            ...analysisState,
            analyzedAt: "2026-03-12T00:00:02.000Z",
            currentActivePackageIds: [
              "ludeon.rimworld",
              "example.camera",
              "unlimitedhugs.hugslib",
            ],
            recommendedActivePackageIds: [
              "ludeon.rimworld",
              "example.camera",
              "unlimitedhugs.hugslib",
            ],
            missingInstalledInactiveDependencies: [],
            sortDifferenceCount: 2,
          };

          return {
            appliedActions: input.actions,
            activePackageIds: modLibraryState.activePackageIds,
            modLibrary: modLibraryState,
            analysis: analysisState,
          };
        }

        analysisState = {
          ...analysisState,
          analyzedAt: "2026-03-12T00:00:03.000Z",
          currentActivePackageIds: [
            "ludeon.rimworld",
            "unlimitedhugs.hugslib",
            "example.camera",
          ],
          recommendedOrderPackageIds: [
            "ludeon.rimworld",
            "unlimitedhugs.hugslib",
            "example.camera",
          ],
          sortDifferenceCount: 0,
          isOptimal: true,
        };
        modLibraryState.activePackageIds = [
          "ludeon.rimworld",
          "unlimitedhugs.hugslib",
          "example.camera",
        ];

        return {
          appliedActions: input.actions,
          activePackageIds: modLibraryState.activePackageIds,
          modLibrary: modLibraryState,
          analysis: analysisState,
        };
      },
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", {
        name: /Enable Missing Dependencies\?/i,
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Enable Dependencies/i }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: /Apply Recommended Sort Order\?/i,
      }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Auto Sort/i }));

    await waitFor(() => {
      expect(appliedActions).toEqual([
        ["enableMissingDependencies"],
        ["reorderActiveMods"],
      ]);
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Applied the recommended active mod order.",
    );
  });

  it("shows a delayed loading overlay while mod-order analysis is still running", async () => {
    window.__RIMUN_RPC__ = createMockRpcClient({
      onAnalyzeModOrder: async () =>
        new Promise((resolve) => {
          window.setTimeout(() => {
            resolve({
              analyzedAt: "2026-03-12T00:00:01.000Z",
              currentActivePackageIds: [
                "ludeon.rimworld",
                "unlimitedhugs.hugslib",
              ],
              recommendedActivePackageIds: [
                "ludeon.rimworld",
                "unlimitedhugs.hugslib",
              ],
              recommendedOrderPackageIds: [
                "ludeon.rimworld",
                "unlimitedhugs.hugslib",
              ],
              missingInstalledInactiveDependencies: [],
              missingUnavailableDependencies: [],
              diagnostics: [],
              explanations: [],
              edges: [],
              isOptimal: true,
              hasBlockingIssues: false,
              sortDifferenceCount: 0,
            });
          }, 650);
        }),
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Analyzing Load Order/i, {}, { timeout: 1_500 }),
    ).toBeInTheDocument();

    await waitFor(
      () => {
        expect(
          screen.queryByText(/Analyzing Load Order/i),
        ).not.toBeInTheDocument();
      },
      { timeout: 2_000 },
    );
  }, 10_000);

  it("keeps empty settings empty, uses bootstrap channels for detection, and saves", async () => {
    const detectedInputs: DetectPathsInput[] = [];
    const savedInputs: string[] = [];

    window.__RIMUN_RPC__ = createMockRpcClient({
      bootstrap: {
        environment: {
          platform: "linux",
          isWsl: true,
          wslDistro: "Ubuntu",
        },
        settings: {
          channel: "steam",
          installationPath: null,
          workshopPath: null,
          configPath: null,
          updatedAt: null,
        },
        supportedChannels: ["steam", "manual"],
        preferredSelection: null,
      },
      settings: {
        channel: "steam",
        installationPath: null,
        workshopPath: null,
        configPath: null,
        updatedAt: null,
      },
      onDetectPaths: async (input) => {
        detectedInputs.push(input);

        return {
          environment: {
            platform: "linux",
            isWsl: true,
            wslDistro: "Ubuntu",
          },
          candidates: [],
          preferredSelection: {
            channel: "steam",
            installationPath: "D:\\Games\\RimWorld",
            workshopPath: null,
            configPath: null,
          },
          errors: [],
          requiresManualSelection: false,
        };
      },
      onSave: async (input) => {
        savedInputs.push(input.installationPath);

        return {
          settings: {
            ...input,
            updatedAt: "2026-03-12T10:00:00.000Z",
          },
          validation: [],
        };
      },
    });

    window.history.replaceState({}, "", "/settings");

    render(<App />);

    const installInput = await screen.findByRole("textbox", {
      name: /Installation Path/i,
    });

    await waitFor(() => {
      expect(installInput).toBeEnabled();
    });

    expect(installInput).toHaveValue("");

    await userEvent.click(
      screen.getByRole("button", { name: /Auto Detect Paths/i }),
    );

    await waitFor(() => {
      expect(detectedInputs).toEqual([
        {
          preferredChannels: ["steam"],
          allowFallbackToManual: true,
        },
      ]);
    });

    await waitFor(() => {
      expect(installInput).toHaveValue("D:\\Games\\RimWorld");
    });

    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(savedInputs).toEqual(["D:\\Games\\RimWorld"]);
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Settings saved.",
    );
  });
});
