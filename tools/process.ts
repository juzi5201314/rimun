import { fileURLToPath } from "node:url";

export type ChildProcess = ReturnType<typeof Bun.spawn>;

const BUN_EXECUTABLE = Bun.which("bun") ?? process.execPath;

type SpawnInheritedOptions = {
  cwd: string | URL;
  env?: NodeJS.ProcessEnv;
};

export function bunCommand(...args: string[]) {
  return [BUN_EXECUTABLE, ...args];
}

export function spawnInherited(
  cmd: string[],
  { cwd, env }: SpawnInheritedOptions,
): ChildProcess {
  return Bun.spawn({
    cmd,
    cwd: typeof cwd === "string" ? cwd : fileURLToPath(cwd),
    env,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
}
