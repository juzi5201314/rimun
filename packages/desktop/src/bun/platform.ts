import { accessSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  AppError,
  DetectPathsInput,
  DetectPathsResult,
  DetectedPath,
  DistributionChannel,
  ExecutionEnvironment,
  PathKind,
  PathSelection,
  ValidatePathInput,
  ValidatePathResult,
  ValidationIssueCode,
} from "@rimun/shared";

const WINDOWS_PATH_PATTERN = /^[A-Za-z]:[\\/].+/;
const WINDOWS_DRIVES = ["C", "D", "E", "F"];
const WINDOWS_USER_CONFIG_SUFFIX = [
  "AppData",
  "LocalLow",
  "Ludeon Studios",
  "RimWorld by Ludeon Studios",
  "Config",
];

function detectPlatform(): ExecutionEnvironment["platform"] {
  if (process.platform === "win32") {
    return "windows";
  }

  if (process.platform === "linux") {
    return "linux";
  }

  if (process.platform === "darwin") {
    return "macos";
  }

  return "unknown";
}

function isWslRuntime() {
  if (process.platform !== "linux") {
    return false;
  }

  if (process.env["WSL_DISTRO_NAME"]) {
    return true;
  }

  try {
    return readFileSync("/proc/version", "utf8")
      .toLowerCase()
      .includes("microsoft");
  } catch {
    return false;
  }
}

export function getExecutionEnvironment(): ExecutionEnvironment {
  const isWsl = isWslRuntime();

  return {
    platform: detectPlatform(),
    isWsl,
    wslDistro: isWsl ? (process.env["WSL_DISTRO_NAME"] ?? "WSL") : null,
  };
}

export function windowsPathToWslPath(windowsPath: string) {
  if (!WINDOWS_PATH_PATTERN.test(windowsPath)) {
    return null;
  }

  const driveLetter = windowsPath.slice(0, 1).toLowerCase();
  const remainder = windowsPath.slice(2).replaceAll("\\", "/");
  return `/mnt/${driveLetter}${remainder}`;
}

function wslPathToWindowsPath(wslPath: string) {
  const match = /^\/mnt\/([a-z])\/(.*)$/.exec(wslPath);

  if (!match) {
    return null;
  }

  const [, driveLetter, tail] = match;
  return `${driveLetter.toUpperCase()}:\\${tail.replaceAll("/", "\\")}`;
}

function resolveReadablePath(windowsPath: string) {
  if (process.platform === "win32") {
    return windowsPath;
  }

  return windowsPathToWslPath(windowsPath);
}

function isReadable(targetPath: string) {
  try {
    accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function validatePath(input: ValidatePathInput): ValidatePathResult {
  const issues: ValidationIssueCode[] = [];

  if (!WINDOWS_PATH_PATTERN.test(input.windowsPath)) {
    issues.push("not_absolute_windows_path");
  }

  const readablePath = resolveReadablePath(input.windowsPath);

  if (!readablePath) {
    issues.push("missing_drive_mapping");
  }

  if (readablePath && !existsSync(readablePath)) {
    issues.push("path_not_found");
  }

  if (readablePath && existsSync(readablePath) && !isReadable(readablePath)) {
    issues.push("not_readable");
  }

  return {
    kind: input.kind,
    channel: input.channel,
    windowsPath: input.windowsPath,
    wslPath: readablePath,
    exists: readablePath ? existsSync(readablePath) : false,
    readable: readablePath ? isReadable(readablePath) : false,
    issues,
  };
}

function createDetectedPath(
  kind: PathKind,
  channel: DistributionChannel,
  windowsPath: string,
  confidence: number,
): DetectedPath {
  const validation = validatePath({
    kind,
    channel,
    windowsPath,
  });

  return {
    kind,
    channel,
    source: "auto",
    windowsPath,
    wslPath: validation.wslPath,
    exists: validation.exists,
    readable: validation.readable,
    confidence,
    notes: [],
  };
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}

function resolveSteamRoots(environment: ExecutionEnvironment) {
  if (environment.isWsl) {
    return WINDOWS_DRIVES.flatMap((driveLetter) => [
      `/mnt/${driveLetter.toLowerCase()}/Program Files (x86)/Steam`,
      `/mnt/${driveLetter.toLowerCase()}/Program Files/Steam`,
      `/mnt/${driveLetter.toLowerCase()}/Steam`,
    ]);
  }

  if (environment.platform === "windows") {
    return [
      "C:\\Program Files (x86)\\Steam",
      "C:\\Program Files\\Steam",
      "D:\\Steam",
      "E:\\Steam",
      "F:\\Steam",
    ];
  }

  return [];
}

function resolveInstallCandidates(environment: ExecutionEnvironment) {
  const steamRoots = resolveSteamRoots(environment);

  if (environment.isWsl) {
    return dedupe(
      steamRoots
        .map((root) => join(root, "steamapps", "common", "RimWorld"))
        .map((wslPath) => wslPathToWindowsPath(wslPath))
        .filter((value): value is string => Boolean(value)),
    );
  }

  return steamRoots.map((root) => `${root}\\steamapps\\common\\RimWorld`);
}

function resolveWorkshopCandidates(environment: ExecutionEnvironment) {
  const steamRoots = resolveSteamRoots(environment);

  if (environment.isWsl) {
    return dedupe(
      steamRoots
        .map((root) => join(root, "steamapps", "workshop", "content", "294100"))
        .map((wslPath) => wslPathToWindowsPath(wslPath))
        .filter((value): value is string => Boolean(value)),
    );
  }

  return steamRoots.map(
    (root) => `${root}\\steamapps\\workshop\\content\\294100`,
  );
}

function resolveConfigCandidates(environment: ExecutionEnvironment) {
  if (environment.isWsl) {
    const usersRoot = "/mnt/c/Users";

    if (!existsSync(usersRoot)) {
      return [];
    }

    return readdirSync(usersRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        join(usersRoot, entry.name, ...WINDOWS_USER_CONFIG_SUFFIX),
      )
      .map((wslPath) => wslPathToWindowsPath(wslPath))
      .filter((value): value is string => Boolean(value));
  }

  if (environment.platform === "windows") {
    const userProfile =
      process.env["USERPROFILE"] ??
      `${process.env["HOMEDRIVE"] ?? "C:"}\\Users\\${process.env["USERNAME"] ?? ""}`;

    return [`${userProfile}\\${WINDOWS_USER_CONFIG_SUFFIX.join("\\")}`];
  }

  return [];
}

function createRecoverableError(
  message: string,
  detail: string | null,
): AppError {
  return {
    code: "environment_error",
    message,
    detail,
    recoverable: true,
  };
}

function pickPreferredSelection(
  candidates: DetectedPath[],
): PathSelection | null {
  const installationPath =
    candidates.find(
      (candidate) => candidate.kind === "installation" && candidate.exists,
    )?.windowsPath ?? null;
  const workshopPath =
    candidates.find(
      (candidate) => candidate.kind === "workshop" && candidate.exists,
    )?.windowsPath ?? null;
  const configPath =
    candidates.find(
      (candidate) => candidate.kind === "config" && candidate.exists,
    )?.windowsPath ?? null;

  if (!installationPath && !workshopPath && !configPath) {
    return null;
  }

  return {
    channel: "steam",
    installationPath,
    workshopPath,
    configPath,
  };
}

export function detectPaths(input: DetectPathsInput): DetectPathsResult {
  const environment = getExecutionEnvironment();
  const candidates: DetectedPath[] = [];

  if (input.preferredChannels.includes("steam")) {
    resolveInstallCandidates(environment).forEach((windowsPath) => {
      candidates.push(
        createDetectedPath("installation", "steam", windowsPath, 0.9),
      );
    });
    resolveWorkshopCandidates(environment).forEach((windowsPath) => {
      candidates.push(
        createDetectedPath("workshop", "steam", windowsPath, 0.8),
      );
    });
    resolveConfigCandidates(environment).forEach((windowsPath) => {
      candidates.push(createDetectedPath("config", "steam", windowsPath, 0.7));
    });
  }

  const preferredSelection = pickPreferredSelection(candidates);
  const errors =
    preferredSelection === null
      ? [
          createRecoverableError(
            "No supported RimWorld installation was detected automatically.",
            environment.isWsl
              ? "WSL scanned common Windows Steam locations, but no readable install was found."
              : "Automatic local detection did not find a readable Steam install.",
          ),
        ]
      : [];

  return {
    environment,
    candidates,
    preferredSelection,
    errors,
    requiresManualSelection:
      preferredSelection === null && input.allowFallbackToManual,
  };
}
