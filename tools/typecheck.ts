import { createToolEnv } from "./env";
import { bunCommand, spawnInherited } from "./process";

const ROOT_DIR = new URL("..", import.meta.url);

async function runStep(cmd: string[]) {
  const childProcess = spawnInherited(bunCommand(...cmd), {
    cwd: ROOT_DIR,
    env: createToolEnv(),
  });

  const exitCode = await childProcess.exited;

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

await runStep(["run", "--cwd", "packages/shared", "check"]);
await runStep(["run", "--cwd", "packages/domain", "check"]);
await runStep(["run", "--cwd", "packages/desktop", "check"]);
await runStep(["run", "--cwd", "packages/web", "check"]);
