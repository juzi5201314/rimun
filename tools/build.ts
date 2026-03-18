import { createToolEnv } from "./env";
import { bunCommand, spawnInherited } from "./process";

const WEB_DIR = new URL("../packages/web", import.meta.url);
const DESKTOP_DIR = new URL("../packages/desktop", import.meta.url);

async function runStep(cwd: URL, cmd: string[]) {
  const childProcess = spawnInherited(bunCommand(...cmd), {
    cwd,
    env: createToolEnv(),
  });

  const exitCode = await childProcess.exited;

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

await runStep(WEB_DIR, ["run", "build"]);
await runStep(DESKTOP_DIR, ["run", "build"]);
