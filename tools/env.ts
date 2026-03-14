const rimunTmpRoot =
  process.env["RIMUN_TMP_ROOT"] ?? process.env["BUN_TMPDIR"] ?? "/tmp";

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
    ...overrides,
  };
}
