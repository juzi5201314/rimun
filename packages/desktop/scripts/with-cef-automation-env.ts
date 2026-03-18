import { createToolEnv } from "../../../tools/env";
import {
  assertLinuxCefAutomationSupported,
  prepareLinuxCefAutomationEnv,
} from "../../../tools/linux-cef-automation";
import { bunCommand, spawnInherited } from "../../../tools/process";

const DESKTOP_DIR = new URL("..", import.meta.url);

async function main() {
  assertLinuxCefAutomationSupported();

  const electrobunArgs = process.argv.slice(2);

  if (electrobunArgs.length === 0) {
    throw new Error("Expected electrobun arguments.");
  }

  const env = await prepareLinuxCefAutomationEnv(createToolEnv());
  const childProcess = spawnInherited(
    bunCommand("x", "electrobun", ...electrobunArgs),
    {
      cwd: DESKTOP_DIR,
      env,
    },
  );
  const exitCode = await childProcess.exited;

  process.exit(exitCode);
}

await main();
