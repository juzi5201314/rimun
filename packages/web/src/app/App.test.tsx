import { App } from "@/app/App";
import { createMockRpcClient } from "@/shared/testing/createMockRpcClient";
import type { DetectPathsInput } from "@rimun/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("App", () => {
  it("renders profile-backed mod library data and auto-saves before switching profiles", async () => {
    window.__RIMUN_RPC__ = createMockRpcClient();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

    const pawnsCheckbox = screen.getByRole("checkbox", {
      name: /Toggle Pawns/i,
    });

    expect(screen.getByRole("combobox", { name: /Profile/i })).toHaveValue(
      "default",
    );
    expect(pawnsCheckbox).not.toBeChecked();

    await userEvent.click(pawnsCheckbox);

    expect(
      (await screen.findAllByText(/Unsaved Changes/i)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /Analysis is paused while this profile has unsaved changes/i,
      ),
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
    window.__RIMUN_RPC__ = createMockRpcClient();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /Mod Library/i }),
    ).toBeInTheDocument();

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

  it("blocks route navigation while the current profile has unsaved changes", async () => {
    window.__RIMUN_RPC__ = createMockRpcClient();

    render(<App />);

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
