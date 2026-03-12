import { App } from "@/app/App";
import { createMockRpcClient } from "@/shared/testing/createMockRpcClient";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("App", () => {
  it("renders bootstrap data on the home page", async () => {
    window.__RIMUN_RPC__ = createMockRpcClient();

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Desktop shell and bridge status are wired/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/linux \(WSL\)/i)).toBeInTheDocument();
  });

  it("loads settings, auto-detects, and saves", async () => {
    const savedInputs: string[] = [];

    window.__RIMUN_RPC__ = createMockRpcClient({
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
      name: /RimWorld install directory/i,
    });

    await waitFor(() => {
      expect(installInput).toBeEnabled();
    });

    await userEvent.clear(installInput);
    await userEvent.type(installInput, "D:\\Games\\RimWorld");

    await userEvent.click(
      screen.getByRole("button", { name: /Save settings/i }),
    );

    await waitFor(() => {
      expect(savedInputs).toEqual(["D:\\Games\\RimWorld"]);
    });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Settings saved.",
    );
  });
});
