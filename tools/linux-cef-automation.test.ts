import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  assertLinuxCefAutomationSupported,
  prepareLinuxCefAutomationEnv,
} from "./linux-cef-automation";

describe("assertLinuxCefAutomationSupported", () => {
  it("rejects non-linux platforms", () => {
    expect(() => assertLinuxCefAutomationSupported("win32")).toThrow(
      "CEF automation is Linux-only.",
    );
  });
});

describe("prepareLinuxCefAutomationEnv", () => {
  it("adds the expected Linux CEF environment variables", async () => {
    const env = await prepareLinuxCefAutomationEnv({
      RIMUN_CEF_STATE_ROOT: "/tmp/rimun-test-cef",
    });

    expect(env["HOME"]).toBe("/tmp/rimun-test-cef/home");
    expect(env["XDG_CONFIG_HOME"]).toBe("/tmp/rimun-test-cef/home/.config");
    expect(env["CHROME_USER_DATA_DIR"]).toBe(
      join("/tmp/rimun-test-cef/home/.config", "rimun"),
    );
    expect(env["RIMUN_ENABLE_CEF_AUTOMATION"]).toBe("1");
  });
});
