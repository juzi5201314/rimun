const WEB_DIR = new URL("../packages/web", import.meta.url);
const DESKTOP_DIR = new URL("../packages/desktop", import.meta.url);

function createToolEnv() {
  return {
    ...process.env,
    BUN_TMPDIR: process.env.BUN_TMPDIR ?? "/tmp",
    BUN_INSTALL: process.env.BUN_INSTALL ?? "/tmp/bun-install",
  };
}

async function runStep(cwd: URL, cmd: string[]) {
  const process = Bun.spawn(["/usr/bin/env", ...cmd], {
    cwd,
    env: createToolEnv(),
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  const exitCode = await process.exited;

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

await runStep(WEB_DIR, ["bun", "run", "build"]);
await runStep(DESKTOP_DIR, ["bun", "run", "build"]);
