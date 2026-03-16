import { App } from "@/app/App";
import { createAppRouter } from "@/app/router";
import { createTestHostApi } from "@/shared/testing/createTestHostApi.node";
import type { DetectPathsInput, SaveProfileInput } from "@rimun/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

function createRescannedSnapshot() {
  return {
    environment: {
      platform: "linux" as const,
      isWsl: true,
      wslDistro: "Ubuntu",
    },
    selection: {
      channel: "steam" as const,
      installationPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      configPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    },
    scannedAt: "2026-03-13T00:45:00.000Z",
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
        source: "installation" as const,
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
            <description>Core game systems.</description>
          </ModMetaData>
        `,
        notes: [],
      },
      {
        entryName: "818773962",
        source: "workshop" as const,
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
            <description>Library helpers for many community mods.</description>
          </ModMetaData>
        `,
        notes: [],
      },
      {
        entryName: "123456789",
        source: "workshop" as const,
        modWindowsPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\123456789",
        modReadablePath:
          "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/294100/123456789",
        manifestPath:
          "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100\\123456789\\About\\About.xml",
        hasAboutXml: true,
        aboutXmlText: `
          <ModMetaData>
            <name>HugsLib Addon</name>
            <packageId>example.hugslibaddon</packageId>
            <author>Orion</author>
            <description>Extra HugsLib integration utilities.</description>
          </ModMetaData>
        `,
        notes: [],
      },
    ],
    errors: [],
    requiresConfiguration: false,
  };
}

function createOptimalHarmonySnapshot() {
  return {
    environment: {
      platform: "linux" as const,
      isWsl: true,
      wslDistro: "Ubuntu",
    },
    selection: {
      channel: "steam" as const,
      installationPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      configPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    },
    scannedAt: "2026-03-15T00:45:00.000Z",
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
        source: "workshop" as const,
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
        source: "installation" as const,
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
        source: "workshop" as const,
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

function createMisorderedHarmonySnapshot() {
  return {
    environment: {
      platform: "linux" as const,
      isWsl: true,
      wslDistro: "Ubuntu",
    },
    selection: {
      channel: "steam" as const,
      installationPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      configPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    },
    scannedAt: "2026-03-15T01:00:00.000Z",
    scannedRoots: {
      installationModsPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld\\Mods",
      workshopPath:
        "C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100",
      modsConfigPath:
        "C:\\Users\\player\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
    },
    activePackageIds: [
      "ludeon.rimworld",
      "brrainz.harmony",
      "oskarpotocki.vanillafactionsexpanded.core",
    ],
    entries: createOptimalHarmonySnapshot().entries,
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

function renderApp(
  options: {
    hostApi?: ReturnType<typeof createTestHostApi>;
    initialEntries?: string[];
  } = {},
) {
  render(
    <App
      hostApi={options.hostApi}
      router={createAppRouter({
        kind: "memory",
        initialEntries: options.initialEntries,
      })}
    />,
  );
}

function getFirstButtonByName(name: RegExp) {
  const button = screen.getAllByRole("button", { name })[0];

  if (!button) {
    throw new Error(`Expected a button matching ${name.toString()}.`);
  }

  return button;
}

async function expandActiveProfilePanel() {
  const toggleButton = screen.getByRole("button", {
    name: /Toggle Active Profile Panel/i,
  });

  if (toggleButton.getAttribute("aria-expanded") !== "true") {
    await userEvent.click(toggleButton);
  }

  return toggleButton;
}

describe("App", () => {
  it("starts with the primary sidebar collapsed while keeping navigation accessible", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /Expand sidebar/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^R$/)).toBeInTheDocument();
    expect(screen.queryByText(/^rimun$/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Settings$/i }),
    ).toBeInTheDocument();
  });

  it("renders dual mod columns with drag handles instead of checkboxes", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Inactive Mods$/i)).toHaveLength(1);
    expect(screen.getAllByText(/^Active Mods$/i)).toHaveLength(1);
    expect(
      screen.getByText(/Drag between columns to enable or disable mods/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Active column order is the exact saved load order/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps the mod details pane in a scrollable overflow container", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    expect(screen.getByTestId("mod-details-pane")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden",
    );
    expect(screen.getByTestId("mod-details-scroll")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
  });

  it("shows an optimal order state without blocking or sort actions for Harmony before Core", async () => {
    renderApp({
      hostApi: createTestHostApi({
        modSourceSnapshot: createOptimalHarmonySnapshot(),
      }),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    expect(screen.getByText(/^Order Optimal$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Blocking Issues$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Apply Recommended Order/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Harmony$/i)).toBeInTheDocument();
  });

  it("shows actionable load-order errors after skipping auto sort", async () => {
    renderApp({
      hostApi: createTestHostApi({
        modSourceSnapshot: createMisorderedHarmonySnapshot(),
      }),
    });

    const sortDialog = await screen.findByRole("dialog", {
      name: /Apply Recommended Sort Order/i,
    });

    await userEvent.click(
      within(sortDialog).getByRole("button", { name: /Keep Current Order/i }),
    );

    expect(
      await screen.findByText(
        /Kept the current order, but 1 load-order errors remain/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Load Order Error$/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Execution Order Hints/i }),
    );

    expect(
      screen.getByText(/^1 order conflicts for this mod$/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/It should load after Harmony/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /Reason: Harmony declares loadBefore Core in About\.xml\./i,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("auto-saves before switching profiles when the current draft is dirty", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    await expandActiveProfilePanel();

    expect(screen.getByRole("combobox", { name: /Profile/i })).toHaveValue(
      "default",
    );
    const profileNameInput = screen.getByRole("textbox", {
      name: /Profile Name/i,
    });

    await userEvent.clear(profileNameInput);
    await userEvent.type(profileNameInput, "Default Loadout");

    expect(await screen.findByTitle(/Unsaved Changes/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/Analysis Paused \(Unsaved Draft\)/i),
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Profile/i }),
      "builder",
    );

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /Profile Name/i }),
      ).toHaveValue("Builder");
    });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Profile/i }),
      "default",
    );

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /Profile Name/i }),
      ).toHaveValue("Default Loadout");
    });
  });

  it("saves the current profile via Ctrl+S when the draft is dirty", async () => {
    const hostApi = createTestHostApi();
    const savedInputs: SaveProfileInput[] = [];

    const originalSaveProfile = hostApi.saveProfile.bind(hostApi);
    hostApi.saveProfile = async (input) => {
      savedInputs.push(input);
      return originalSaveProfile(input);
    };

    renderApp({ hostApi });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    await expandActiveProfilePanel();

    await userEvent.type(
      screen.getByRole("textbox", { name: /Profile Name/i }),
      " Draft",
    );

    expect(await screen.findByTitle(/Unsaved Changes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save$/i })).toBeInTheDocument();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "s",
        ctrlKey: true,
      }),
    );

    await waitFor(() => {
      expect(savedInputs).toHaveLength(1);
    });

    expect(savedInputs[0]?.applyToGame).toBe(true);
  });

  it("creates a new profile from the current saved snapshot", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    await expandActiveProfilePanel();

    await userEvent.click(screen.getByRole("button", { name: /New Profile/i }));

    const dialog = await screen.findByRole("dialog", {
      name: /Create New Profile/i,
    });
    const dialogControls = within(dialog);

    await userEvent.clear(
      dialogControls.getByRole("textbox", {
        name: /Profile Name/i,
      }),
    );
    await userEvent.type(
      dialogControls.getByRole("textbox", { name: /Profile Name/i }),
      "Combat Run",
    );
    await userEvent.click(
      dialogControls.getByRole("button", { name: /Create Profile/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /Profile/i })).toHaveValue(
        "profile-3",
      );
    });
    expect(
      screen.getByRole("option", { name: "Combat Run" }),
    ).toBeInTheDocument();
  });

  it("collapses and expands the active profile panel", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    const toggleButton = screen.getByRole("button", {
      name: /Toggle Active Profile Panel/i,
    });

    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("combobox", { name: /Profile Selection/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(toggleButton);

    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("combobox", { name: /Profile Selection/i }),
    ).toBeInTheDocument();

    await userEvent.click(toggleButton);

    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("combobox", { name: /Profile Selection/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("collapses and expands the filters panel", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    await expandActiveProfilePanel();

    const filterToggleButton = screen.getByRole("button", {
      name: /Toggle Filters Panel/i,
    });

    expect(
      screen.queryByRole("button", { name: /^All Sources$/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(filterToggleButton);

    expect(filterToggleButton).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: /^All Sources$/i }),
    ).toBeInTheDocument();

    await userEvent.click(filterToggleButton);

    expect(filterToggleButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: /^All Sources$/i }),
    ).not.toBeInTheDocument();
  });

  it("blocks route navigation while the current profile has unsaved changes", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    await expandActiveProfilePanel();

    await userEvent.type(
      screen.getByRole("textbox", { name: /Profile Name/i }),
      " Draft",
    );

    await userEvent.click(screen.getByRole("link", { name: /^Settings$/i }));

    const dialog = await screen.findByRole("dialog", {
      name: /Discard Unsaved Profile Changes/i,
    });
    const dialogControls = within(dialog);

    expect(
      dialogControls.getByText(/Leaving this page now will discard/i),
    ).toBeInTheDocument();

    await userEvent.click(
      dialogControls.getByRole("button", { name: /Stay Here/i }),
    );

    expect(
      screen.getByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", {
        name: /Discard Unsaved Profile Changes/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps empty settings empty, uses bootstrap channels for detection, and saves", async () => {
    const detectedInputs: DetectPathsInput[] = [];
    const savedInputs: string[] = [];

    const hostApi = createTestHostApi({
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

    renderApp({
      hostApi,
      initialEntries: ["/settings"],
    });

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

  it("keeps the UI interactive during rescan and preserves search, selection, and feedback", async () => {
    const deferredRescan =
      createDeferred<ReturnType<typeof createRescannedSnapshot>>();
    let snapshotRequests = 0;
    const initialHostApi = createTestHostApi();
    const hostApi = createTestHostApi({
      onGetModSourceSnapshot: async ({ profileId }) => {
        snapshotRequests += 1;

        if (snapshotRequests === 1) {
          return initialHostApi.getModSourceSnapshot({ profileId });
        }

        return deferredRescan.promise;
      },
    });

    renderApp({ hostApi });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(
      /Search by name, author, or package id/i,
    );

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "hug");

    await userEvent.click(
      screen.getByText("HugsLib").closest("button") as HTMLButtonElement,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /^HugsLib$/i }),
      ).toBeInTheDocument();
    });

    const lastScanLabel = screen.getByText(/Last Scan:/i).textContent;
    const rescanButton = screen.getByRole("button", { name: /Rescan/i });

    await userEvent.click(rescanButton);

    await waitFor(() => {
      expect(rescanButton).toBeDisabled();
      expect(rescanButton.querySelector("svg.animate-spin")).not.toBeNull();
      expect(screen.queryByText(/Loading Profile/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Persisting Data/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Synchronizing Order/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Generating Profile/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Removing Record/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Analyzing Dependencies/i),
      ).not.toBeInTheDocument();
    });

    await userEvent.type(searchInput, "slib");
    expect(searchInput).toHaveValue("hugslib");
    expect(
      screen.getByRole("heading", { name: /^HugsLib$/i }),
    ).toBeInTheDocument();

    deferredRescan.resolve(createRescannedSnapshot());

    await waitFor(() => {
      expect(rescanButton).toBeEnabled();
      expect(searchInput).toHaveValue("hugslib");
      expect(
        screen.getByRole("heading", { name: /^HugsLib$/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Mod library rescanned from the current configured roots\./i,
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(/Last Scan:/i).textContent).not.toBe(
        lastScanLabel,
      );
    });
  });

  it("configures llm providers, auto-fetches model metadata, and saves", async () => {
    const savedProviders: string[] = [];

    const hostApi = createTestHostApi({
      onSearchModelMetadata: async (input) => ({
        query: input.modelId,
        cachedAt: "2026-03-14T12:00:00.000Z",
        matches: [
          {
            sourceProviderId: "anthropic",
            sourceProviderName: "Anthropic",
            sourceProviderApi: "https://api.anthropic.com/v1",
            modelId: input.modelId,
            modelName: "Claude Sonnet 4.5",
            family: "claude-sonnet",
            metadata: {
              contextLimit: 200000,
              inputLimit: null,
              outputLimit: 64000,
              supportsToolCall: true,
              supportsReasoning: true,
              supportsStructuredOutput: false,
              releaseDate: "2025-09-29",
              lastUpdated: "2025-09-29",
              pricing: null,
            },
          },
        ],
      }),
      onSaveLlmSettings: async (input) => {
        savedProviders.push(
          ...input.providers.map((provider) => provider.name),
        );

        return {
          providers: input.providers,
          updatedAt: "2026-03-14T12:05:00.000Z",
        };
      },
    });

    renderApp({
      hostApi,
      initialEntries: ["/settings"],
    });

    expect(
      await screen.findByRole("heading", { name: /LLM Providers/i }),
    ).toBeInTheDocument();

    await userEvent.click(getFirstButtonByName(/Add Provider/i));
    await userEvent.clear(
      screen.getByRole("textbox", { name: /Provider Name/i }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Provider Name/i }),
      "Anthropic Primary",
    );
    await userEvent.type(screen.getByPlaceholderText("sk-..."), "secret-key");
    await userEvent.click(screen.getByRole("button", { name: /Add Model/i }));

    const modelIdInput = await screen.findByRole("textbox", {
      name: /Model ID/i,
    });
    await userEvent.clear(modelIdInput);
    await userEvent.type(modelIdInput, "claude-sonnet-4-5-20250929");

    await waitFor(() => {
      expect(screen.getByText(/Context 200,000/i)).toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Save LLM Config/i }),
    );

    await waitFor(() => {
      expect(savedProviders).toEqual(["Anthropic Primary"]);
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "LLM settings saved.",
    );
  });

  it("lets the user choose among multiple metadata matches", async () => {
    const hostApi = createTestHostApi({
      onSearchModelMetadata: async (input) => ({
        query: input.modelId,
        cachedAt: "2026-03-14T12:10:00.000Z",
        matches: [
          {
            sourceProviderId: "anthropic",
            sourceProviderName: "Anthropic",
            sourceProviderApi: "https://api.anthropic.com/v1",
            modelId: input.modelId,
            modelName: "Claude Sonnet 4.5",
            family: "claude-sonnet",
            metadata: {
              contextLimit: 200000,
              inputLimit: null,
              outputLimit: 64000,
              supportsToolCall: true,
              supportsReasoning: true,
              supportsStructuredOutput: false,
              releaseDate: "2025-09-29",
              lastUpdated: "2025-09-29",
              pricing: null,
            },
          },
          {
            sourceProviderId: "openrouter",
            sourceProviderName: "OpenRouter",
            sourceProviderApi: "https://openrouter.ai/api/v1",
            modelId: input.modelId,
            modelName: "Claude Sonnet 4.5",
            family: "claude-sonnet",
            metadata: {
              contextLimit: 1000000,
              inputLimit: null,
              outputLimit: 64000,
              supportsToolCall: true,
              supportsReasoning: true,
              supportsStructuredOutput: true,
              releaseDate: "2025-09-29",
              lastUpdated: "2025-09-30",
              pricing: null,
            },
          },
        ],
      }),
    });

    renderApp({
      hostApi,
      initialEntries: ["/settings"],
    });

    expect(
      await screen.findByRole("heading", { name: /LLM Providers/i }),
    ).toBeInTheDocument();

    await userEvent.click(getFirstButtonByName(/Add Provider/i));
    await userEvent.click(screen.getByRole("button", { name: /Add Model/i }));

    const modelIdInput = await screen.findByRole("textbox", {
      name: /Model ID/i,
    });
    await userEvent.type(modelIdInput, "claude-sonnet-4-5-20250929");

    const dialog = await screen.findByRole("dialog", {
      name: /Choose Metadata Source/i,
    });
    const dialogControls = within(dialog);
    const radios = dialogControls.getAllByRole("radio");
    const secondRadio = radios[1];

    if (!secondRadio) {
      throw new Error("Expected a second metadata source option.");
    }

    await userEvent.click(secondRadio);
    await userEvent.click(
      dialogControls.getByRole("button", { name: /Use Selected Metadata/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Metadata source: OpenRouter/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Context 1,000,000/i)).toBeInTheDocument();
  });
});
