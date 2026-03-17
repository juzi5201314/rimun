const rimunTmpRoot =
  process.env["RIMUN_TMP_ROOT"] ?? process.env["BUN_TMPDIR"] ?? "/tmp";
const rimunWebPort = process.env["RIMUN_WEB_PORT"] ?? "5173";

export function createToolEnv(
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BUN_TMPDIR: process.env["BUN_TMPDIR"] ?? rimunTmpRoot,
    BUN_INSTALL: process.env["BUN_INSTALL"] ?? `${rimunTmpRoot}/bun-install`,
    RIMUN_CEF_STATE_ROOT:
      process.env["RIMUN_CEF_STATE_ROOT"] ??
      `${rimunTmpRoot}/rimun-cef-automation`,
    RIMUN_WEB_PORT: rimunWebPort,
    ...overrides,
  };

  const devServerUrl =
    overrides["RIMUN_DEV_SERVER_URL"] ?? process.env["RIMUN_DEV_SERVER_URL"];

  if (devServerUrl) {
    env["RIMUN_DEV_SERVER_URL"] = devServerUrl;
  } else {
    delete env["RIMUN_DEV_SERVER_URL"];
  }

  return env;
}
