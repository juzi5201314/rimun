import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createToolEnv } from "./env";

describe("createToolEnv", () => {
  it("uses platform-native temp directories when no env is set", () => {
    const env = createToolEnv({}, {});

    expect(env["BUN_TMPDIR"]).toBeDefined();
    expect(env["BUN_INSTALL"]).toBe(join(env["BUN_TMPDIR"]!, "bun-install"));
    expect(env["RIMUN_CEF_STATE_ROOT"]).toBe(
      join(env["BUN_TMPDIR"]!, "rimun-cef-automation"),
    );
  });

  it("lets overrides define the tmp root", () => {
    const env = createToolEnv({
      BUN_TMPDIR: "C:\\temp\\rimun",
    });

    expect(env["BUN_TMPDIR"]).toBe("C:\\temp\\rimun");
    expect(env["BUN_INSTALL"]).toBe("C:\\temp\\rimun/bun-install");
  });
});
