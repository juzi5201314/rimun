import { setTimeout as sleep } from "node:timers/promises";
import { createToolEnv } from "./env";

const ROOT_DIR = new URL("..", import.meta.url);
const WEB_DIR = new URL("../packages/web", import.meta.url);
const DESKTOP_DIR = new URL("../packages/desktop", import.meta.url);
const DEV_SERVER_URL = "http://127.0.0.1:5173";

type Child = ReturnType<typeof Bun.spawn>;

function spawnLoggedProcess(
  cwd: URL,
  cmd: string[],
  env: Record<string, string>,
): Child {
  return Bun.spawn(["/usr/bin/env", ...cmd], {
    cwd,
    env,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
}

async function waitForHttpReady(url: string, timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // 服务还没起来，继续轮询。
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const webProcess = spawnLoggedProcess(
    WEB_DIR,
    ["bun", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
    createToolEnv({}),
  );
  let desktopProcess: Child | null = null;

  const stopChildren = () => {
    webProcess.kill();
    desktopProcess?.kill();
  };

  process.on("SIGINT", stopChildren);
  process.on("SIGTERM", stopChildren);

  await waitForHttpReady(DEV_SERVER_URL, 30_000);

  desktopProcess = spawnLoggedProcess(
    DESKTOP_DIR,
    ["bun", "run", "dev"],
    createToolEnv({
      RIMUN_DEV_SERVER_URL: DEV_SERVER_URL,
      RIMUN_DEV_WORKSPACE_ROOT: Bun.fileURLToPath(ROOT_DIR),
    }),
  );

  const desktopExitCode = await desktopProcess.exited;
  stopChildren();

  process.exit(desktopExitCode);
}

await main();
