import { App } from "@/app/App";
import { createAppRouter } from "@/app/router";
import { createTestHostApi } from "@/shared/testing/createTestHostApi";
import type { DetectPathsInput } from "@rimun/shared";
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
      screen.getByText(/Analysis Paused \(Unsaved Draft\)/i),
    ).toBeInTheDocument();

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
});
