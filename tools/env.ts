const rimunTmpRoot =
  process.env["RIMUN_TMP_ROOT"] ?? process.env["BUN_TMPDIR"] ?? "/tmp";
const rimunWebPort = process.env["RIMUN_WEB_PORT"] ?? "5173";
const rimunDevServerUrl =
  process.env["RIMUN_DEV_SERVER_URL"] ?? `http://127.0.0.1:${rimunWebPort}`;

export function createToolEnv(
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BUN_TMPDIR: process.env["BUN_TMPDIR"] ?? rimunTmpRoot,
    BUN_INSTALL: process.env["BUN_INSTALL"] ?? `${rimunTmpRoot}/bun-install`,
    RIMUN_CEF_STATE_ROOT:
      process.env["RIMUN_CEF_STATE_ROOT"] ??
      `${rimunTmpRoot}/rimun-cef-automation`,
    RIMUN_WEB_PORT: rimunWebPort,
    RIMUN_DEV_SERVER_URL: rimunDevServerUrl,
    ...overrides,
  };
}
