import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { parseDevOptions, type DevMode } from "./dev-options";
import { resolveAvailableDevServerConfig } from "./dev-server";
import { createToolEnv } from "./env";
import {
  assertLinuxCefAutomationSupported,
  prepareLinuxCefAutomationEnv,
} from "./linux-cef-automation";
import { bunCommand, spawnInherited, type ChildProcess } from "./process";

const ROOT_DIR = new URL("..", import.meta.url);
const WEB_DIR = new URL("../packages/web", import.meta.url);
const DESKTOP_DIR = new URL("../packages/desktop", import.meta.url);
const REQUIRED_LINUX_WEBKIT_LIBRARY = "libwebkit2gtk-4.1.so.0";
const DEFAULT_DEV_HOST_PORT = "3070";
const DEV_STARTUP_TIMEOUT_MS = 30_000;

type ManagedProcess = {
  name: string;
  process: ChildProcess;
};

function cleanupProcesses(processes: ManagedProcess[]) {
  for (const managed of processes) {
    try {
      managed.process.kill();
    } catch {
      // 进程已经退出时不需要再次终止。
    }
  }
}

function watchProcessExit(managed: ManagedProcess) {
  return managed.process.exited.then((exitCode) => ({
    exitCode,
    name: managed.name,
  }));
}

function hasRequiredLinuxWebkitLibrary() {
  const result = Bun.spawnSync({
    cmd: ["ldconfig", "-p"],
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    return false;
  }

  return new TextDecoder()
    .decode(result.stdout)
    .includes(REQUIRED_LINUX_WEBKIT_LIBRARY);
}

function resolveDesktopLaunchMode(
  mode: DevMode,
  cefAutomation: boolean,
  platform = process.platform,
) {
  if (mode === "web") {
    console.log("RIMUN_DEV_MODE=web, skipping desktop shell.");
    return false;
  }

  if (platform !== "linux") {
    return true;
  }

  if (cefAutomation) {
    return true;
  }

  if (hasRequiredLinuxWebkitLibrary()) {
    return true;
  }

  const message = `Linux desktop runtime requires ${REQUIRED_LINUX_WEBKIT_LIBRARY}. Install the system package first, or run with --mode web.`;

  if (mode === "desktop") {
    throw new Error(message);
  }

  console.log(`${message} Falling back to web-only dev mode.`);
  return false;
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

async function waitForHttpReadyOrExit(
  managed: ManagedProcess,
  url: string,
  timeoutMs: number,
) {
  await Promise.race([
    waitForHttpReady(url, timeoutMs),
    managed.process.exited.then((exitCode) => {
      throw new Error(
        `${managed.name} exited with code ${exitCode} before ${url} became ready.`,
      );
    }),
  ]);
}

async function main() {
  const options = parseDevOptions(process.argv.slice(2));

  if (options.cefAutomation) {
    assertLinuxCefAutomationSupported();
  }

  const devHostPort =
    process.env["RIMUN_DEV_HOST_PORT"] ?? DEFAULT_DEV_HOST_PORT;
  const devServer = await resolveAvailableDevServerConfig(process.env);
  const webPort = String(devServer.port);
  const devServerUrl = devServer.origin;
  const baseEnv = createToolEnv({
    RIMUN_DEV_HOST_PORT: devHostPort,
    RIMUN_DEV_SERVER_URL: devServerUrl,
    RIMUN_DEV_WORKSPACE_ROOT: fileURLToPath(ROOT_DIR),
    RIMUN_WEB_PORT: webPort,
  });
  const managedProcesses: ManagedProcess[] = [];
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    cleanupProcesses(managedProcesses);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    const webProcess: ManagedProcess = {
      name: "web",
      process: spawnInherited(
        bunCommand(
          "run",
          "dev",
          "--",
          "--host",
          "127.0.0.1",
          "--port",
          webPort,
          "--strictPort",
        ),
        {
          cwd: WEB_DIR,
          env: baseEnv,
        },
      ),
    };
    managedProcesses.push(webProcess);
    await waitForHttpReadyOrExit(
      webProcess,
      devServerUrl,
      DEV_STARTUP_TIMEOUT_MS,
    );

    const hostProcess: ManagedProcess = {
      name: "dev-host",
      process: spawnInherited(bunCommand("run", "dev:host"), {
        cwd: DESKTOP_DIR,
        env: baseEnv,
      }),
    };
    managedProcesses.push(hostProcess);
    await waitForHttpReadyOrExit(
      hostProcess,
      `http://127.0.0.1:${devHostPort}/health`,
      DEV_STARTUP_TIMEOUT_MS,
    );

    if (resolveDesktopLaunchMode(options.mode, options.cefAutomation)) {
      const desktopEnv = options.cefAutomation
        ? await prepareLinuxCefAutomationEnv(baseEnv)
        : baseEnv;

      managedProcesses.push({
        name: "desktop",
        process: spawnInherited(bunCommand("run", "dev"), {
          cwd: DESKTOP_DIR,
          env: desktopEnv,
        }),
      });
    }

    const firstExit = await Promise.race(
      managedProcesses.map((managed) => watchProcessExit(managed)),
    );

    if (firstExit.exitCode !== 0) {
      console.error(
        `${firstExit.name} exited with code ${firstExit.exitCode}. Stopping dev processes.`,
      );
    }

    cleanup();
    process.exit(firstExit.exitCode);
  } catch (error) {
    cleanup();
    throw error;
  }
}

await main();
