import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_CDP_PORT = "9222";

export function assertLinuxCefAutomationSupported(platform = process.platform) {
  if (platform !== "linux") {
    throw new Error(
      "CEF automation is Linux-only. Use a Linux environment for dev:cdp or build:test:cdp.",
    );
  }
}

export async function prepareLinuxCefAutomationEnv(
  env: NodeJS.ProcessEnv,
): Promise<NodeJS.ProcessEnv> {
  const stateRoot = env["RIMUN_CEF_STATE_ROOT"];

  if (!stateRoot) {
    throw new Error("Missing RIMUN_CEF_STATE_ROOT for CEF automation.");
  }

  const home = join(stateRoot, "home");
  const configHome = join(home, ".config");
  const cacheHome = join(home, ".cache");
  const runtimeDir = join(stateRoot, "runtime");

  await mkdir(join(configHome, "rimun"), { recursive: true });
  await mkdir(
    join(
      cacheHome,
      "sh.blackboard.rimun",
      "dev",
      "CEF",
      "Partitions",
      "default",
    ),
    {
      recursive: true,
    },
  );
  await mkdir(join(home, ".pki", "nssdb"), { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await chmod(runtimeDir, 0o700);

  return {
    ...env,
    CHROME_CONFIG_HOME: configHome,
    CHROME_USER_DATA_DIR: join(configHome, "rimun"),
    HOME: home,
    RIMUN_CDP_PORT: env["RIMUN_CDP_PORT"] ?? DEFAULT_CDP_PORT,
    RIMUN_ENABLE_CEF_AUTOMATION: "1",
    XDG_CACHE_HOME: cacheHome,
    XDG_CONFIG_HOME: configHome,
    XDG_RUNTIME_DIR: runtimeDir,
  };
}
