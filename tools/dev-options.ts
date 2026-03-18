export type DevMode = "auto" | "web" | "desktop";

export type DevOptions = {
  cefAutomation: boolean;
  mode: DevMode;
};

const DEV_MODES = new Set<DevMode>(["auto", "web", "desktop"]);

function readModeValue(argv: string[], index: number) {
  const value = argv[index + 1];

  if (!value) {
    throw new Error("Missing value for --mode.");
  }

  if (!DEV_MODES.has(value as DevMode)) {
    throw new Error(
      `Unsupported --mode value: ${value}. Expected auto, web, or desktop.`,
    );
  }

  return value as DevMode;
}

export function parseDevOptions(argv: string[]): DevOptions {
  let mode: DevMode = "auto";
  let cefAutomation = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--cef-automation") {
      cefAutomation = true;
      continue;
    }

    if (arg === "--mode") {
      mode = readModeValue(argv, index);
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);

      if (!DEV_MODES.has(value as DevMode)) {
        throw new Error(
          `Unsupported --mode value: ${value}. Expected auto, web, or desktop.`,
        );
      }

      mode = value as DevMode;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return {
    cefAutomation,
    mode,
  };
}
