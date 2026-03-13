const ROOT_DIR = new URL("..", import.meta.url);

function createToolEnv() {
  return {
    ...process.env,
    BUN_TMPDIR: process.env.BUN_TMPDIR ?? "/tmp",
    BUN_INSTALL: process.env.BUN_INSTALL ?? "/tmp/bun-install",
  };
}

async function runStep(cmd: string[]) {
  const process = Bun.spawn(["/usr/bin/env", ...cmd], {
    cwd: ROOT_DIR,
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

await runStep(["bun", "run", "--cwd", "packages/shared", "test"]);
await runStep(["bun", "run", "--cwd", "packages/desktop", "test"]);
await runStep(["bun", "run", "--cwd", "packages/web", "test"]);
