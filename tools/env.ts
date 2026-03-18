import { tmpdir } from "node:os";
import { join } from "node:path";

export function createToolEnv(
  overrides: Record<string, string> = {},
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const mergedEnv: NodeJS.ProcessEnv = {
    ...baseEnv,
    ...overrides,
  };
  const rimunTmpRoot =
    mergedEnv["RIMUN_TMP_ROOT"] ?? mergedEnv["BUN_TMPDIR"] ?? tmpdir();
  const rimunWebPort = mergedEnv["RIMUN_WEB_PORT"] ?? "5173";
  const env: NodeJS.ProcessEnv = {
    ...mergedEnv,
    BUN_TMPDIR: mergedEnv["BUN_TMPDIR"] ?? rimunTmpRoot,
    BUN_INSTALL: mergedEnv["BUN_INSTALL"] ?? join(rimunTmpRoot, "bun-install"),
    RIMUN_CEF_STATE_ROOT:
      mergedEnv["RIMUN_CEF_STATE_ROOT"] ??
      join(rimunTmpRoot, "rimun-cef-automation"),
    RIMUN_WEB_PORT: rimunWebPort,
  };

  const devServerUrl =
    overrides["RIMUN_DEV_SERVER_URL"] ?? baseEnv["RIMUN_DEV_SERVER_URL"];

  if (devServerUrl) {
    env["RIMUN_DEV_SERVER_URL"] = devServerUrl;
  } else {
    delete env["RIMUN_DEV_SERVER_URL"];
  }

  return env;
}
