import { App } from "@/app/App";
import { createAppRouter } from "@/app/router";
import { createTestHostApi } from "@/shared/testing/createTestHostApi";
import type { DetectPathsInput } from "@rimun/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

function renderApp(options: {
  hostApi?: ReturnType<typeof createTestHostApi>;
  initialEntries?: string[];
} = {}) {
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
  it("renders profile-backed mod library data and auto-saves before switching profiles", async () => {
    renderApp({
      hostApi: createTestHostApi(),
    });

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    const pawnsCheckbox = screen.getByRole("checkbox", {
      name: /Toggle Pawns/i,
    });

    await expandActiveProfilePanel();

    expect(screen.getByRole("combobox", { name: /Profile/i })).toHaveValue(
      "default",
    );
    expect(pawnsCheckbox).not.toBeChecked();

    await userEvent.click(pawnsCheckbox);

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
    expect(
      screen.getByRole("checkbox", { name: /Toggle Pawns/i }),
    ).toBeChecked();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Profile/i }),
      "default",
    );

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /Profile Name/i }),
      ).toHaveValue("Default");
      expect(
        screen.getByRole("checkbox", { name: /Toggle Pawns/i }),
      ).toBeChecked();
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

    await userEvent.click(
      screen.getByRole("checkbox", { name: /Toggle Pawns/i }),
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
});
