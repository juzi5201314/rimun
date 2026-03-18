import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AppError,
  DistributionChannel,
  ModLocalizationKind,
  PathSelection,
} from "@rimun/shared";
import {
  getModLocalizationPerfStatsForTests,
  resetModLocalizationPerfStateForTests,
} from "./mod-localization";
import {
  createReadablePathResolver,
  readActivePackageIdsFromSelection,
  readModLocalizationSnapshotForSnapshot,
  readModSourceSnapshot,
  resetModScanPerfStateForTests,
} from "./mods";
import { SettingsRepository } from "./persistence";
import { detectPaths, validatePath } from "./platform";

type CliOptions = {
  channel: DistributionChannel | null;
  configPath: string | null;
  freshCache: boolean;
  installationPath: string | null;
  noConfig: boolean;
  noWorkshop: boolean;
  profileId: string | null;
  warmRuns: number;
  workshopPath: string | null;
};

type ResolvedSelection = {
  selection: PathSelection;
  source: "auto-detect" | "cli" | "saved-settings";
};

type BenchmarkRunResult = {
  elapsedMs: number;
  kindCounts: Record<ModLocalizationKind, number>;
  progressEventCount: number;
  stats: ReturnType<typeof getModLocalizationPerfStatsForTests>;
};

function printHelp() {
  console.log(`
真实目录翻译分析 benchmark

用法:
  bun run src/bun/bench-real-localization.ts [options]

选项:
  --installation-path <windows-path>  指定 RimWorld 安装目录
  --workshop-path <windows-path>      指定 Workshop 目录
  --config-path <windows-path>        指定 Config 目录
  --channel <steam|gog|epic|manual>   指定路径来源渠道
  --profile-id <id>                   使用指定的 rimun profile
  --warm-runs <n>                     warm run 次数，默认 1
  --fresh-cache                       使用临时 app data，测试空缓存起步
  --no-workshop                       不扫描 Workshop 目录
  --no-config                         不读取 Config 目录
  -h, --help                          显示帮助

路径解析优先级:
  CLI 显式传参 > 已保存设置 > 自动探测

示例:
  bun run src/bun/bench-real-localization.ts --warm-runs 3
  bun run src/bun/bench-real-localization.ts --fresh-cache
  bun run src/bun/bench-real-localization.ts --installation-path "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld"
`);
}

function parsePositiveInteger(rawValue: string, optionName: string) {
  const value = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${optionName} expects a positive integer.`);
  }

  return value;
}

function requireOptionValue(
  args: string[],
  index: number,
  optionName: string,
): string {
  const next = args[index + 1];

  if (!next || next.startsWith("-")) {
    throw new Error(`${optionName} requires a value.`);
  }

  return next;
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    channel: null,
    configPath: null,
    freshCache: false,
    installationPath: null,
    noConfig: false,
    noWorkshop: false,
    profileId: null,
    warmRuns: 1,
    workshopPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      case "--installation-path":
        options.installationPath = requireOptionValue(
          argv,
          index,
          "--installation-path",
        );
        index += 1;
        break;
      case "--workshop-path":
        options.workshopPath = requireOptionValue(
          argv,
          index,
          "--workshop-path",
        );
        index += 1;
        break;
      case "--config-path":
        options.configPath = requireOptionValue(argv, index, "--config-path");
        index += 1;
        break;
      case "--channel": {
        const value = requireOptionValue(argv, index, "--channel");

        if (!["steam", "gog", "epic", "manual"].includes(value)) {
          throw new Error(
            "--channel expects one of steam, gog, epic, manual.",
          );
        }

        options.channel = value as DistributionChannel;
        index += 1;
        break;
      }
      case "--profile-id":
        options.profileId = requireOptionValue(argv, index, "--profile-id");
        index += 1;
        break;
      case "--warm-runs":
        options.warmRuns = parsePositiveInteger(
          requireOptionValue(argv, index, "--warm-runs"),
          "--warm-runs",
        );
        index += 1;
        break;
      case "--fresh-cache":
        options.freshCache = true;
        break;
      case "--no-workshop":
        options.noWorkshop = true;
        break;
      case "--no-config":
        options.noConfig = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.noWorkshop) {
    options.workshopPath = null;
  }

  if (options.noConfig) {
    options.configPath = null;
  }

  return options;
}

function hasCliSelectionOverride(options: CliOptions) {
  return (
    options.channel !== null ||
    options.installationPath !== null ||
    options.workshopPath !== null ||
    options.configPath !== null ||
    options.noWorkshop ||
    options.noConfig
  );
}

function resolveBaseSelection(repository: SettingsRepository): ResolvedSelection | null {
  const settings = repository.getSettings();

  if (settings.installationPath) {
    return {
      selection: {
        channel: settings.channel,
        configPath: settings.configPath,
        installationPath: settings.installationPath,
        workshopPath: settings.workshopPath,
      },
      source: "saved-settings",
    };
  }

  const detected = detectPaths({
    preferredChannels: ["steam"],
    allowFallbackToManual: true,
  }).preferredSelection;

  if (!detected) {
    return null;
  }

  return {
    selection: detected,
    source: "auto-detect",
  };
}

function resolveSelection(
  repository: SettingsRepository,
  options: CliOptions,
): ResolvedSelection {
  const base = resolveBaseSelection(repository);
  const source = hasCliSelectionOverride(options)
    ? "cli"
    : (base?.source ?? "cli");
  const baseSelection: PathSelection = base?.selection ?? {
    channel: options.channel ?? "steam",
    configPath: null,
    installationPath: null,
    workshopPath: null,
  };

  const selection: PathSelection = {
    channel: options.channel ?? baseSelection.channel,
    configPath: options.noConfig
      ? null
      : (options.configPath ?? baseSelection.configPath),
    installationPath: options.installationPath ?? baseSelection.installationPath,
    workshopPath: options.noWorkshop
      ? null
      : (options.workshopPath ?? baseSelection.workshopPath),
  };

  if (!selection.installationPath) {
    throw new Error(
      "No installation path was resolved. Pass --installation-path or save settings in the desktop app first.",
    );
  }

  return {
    selection,
    source,
  };
}

function logPathValidation(
  label: string,
  kind: "installation" | "workshop" | "config",
  channel: DistributionChannel,
  windowsPath: string | null,
) {
  if (!windowsPath) {
    console.log(`${label}: <disabled>`);
    return;
  }

  const validation = validatePath({
    channel,
    kind,
    windowsPath,
  });
  const issues =
    validation.issues.length > 0 ? validation.issues.join(",") : "none";

  console.log(
    `${label}: ${windowsPath} | readable=${validation.wslPath ?? windowsPath} | exists=${validation.exists} | readableOk=${validation.readable} | issues=${issues}`,
  );
}

function logErrors(errors: AppError[]) {
  if (errors.length === 0) {
    return;
  }

  console.log("");
  console.log("Errors:");

  for (const error of errors) {
    const detail = error.detail ? ` | detail=${error.detail}` : "";
    console.log(
      `- [${error.code}] ${error.message} | recoverable=${error.recoverable}${detail}`,
    );
  }
}

function countKinds(
  entries: Array<{ localizationStatus: { kind: ModLocalizationKind } }>,
) {
  const counts: Record<ModLocalizationKind, number> = {
    missing: 0,
    missing_language: 0,
    translated: 0,
    unknown: 0,
  };

  for (const entry of entries) {
    counts[entry.localizationStatus.kind] += 1;
  }

  return counts;
}

function formatMs(value: number) {
  return value.toFixed(1);
}

function formatKindCounts(counts: Record<ModLocalizationKind, number>) {
  return [
    `translated=${counts.translated}`,
    `missing=${counts.missing}`,
    `missing_language=${counts.missing_language}`,
    `unknown=${counts.unknown}`,
  ].join(" ");
}

async function runLocalizationBenchmark(args: {
  resetBeforeRun: boolean;
  selection: PathSelection;
  snapshot: Awaited<ReturnType<typeof readModSourceSnapshot>>;
  toReadablePath: ReturnType<typeof createReadablePathResolver>;
}) {
  if (args.resetBeforeRun) {
    resetModLocalizationPerfStateForTests();
  }

  let progressEventCount = 0;
  const startedAt = performance.now();
  const localizationSnapshot = await readModLocalizationSnapshotForSnapshot(
    args.snapshot,
    {
      onProgress: () => {
        progressEventCount += 1;
      },
      toReadablePath: args.toReadablePath,
    },
  );
  const elapsedMs = performance.now() - startedAt;
  const stats = getModLocalizationPerfStatsForTests();
  const kindCounts = countKinds(localizationSnapshot.entries);
  void args.selection;

  return {
    elapsedMs,
    kindCounts,
    progressEventCount,
    stats,
  } satisfies BenchmarkRunResult;
}

async function resolveProfileActivePackageIds(args: {
  options: CliOptions;
  repository: SettingsRepository;
  selection: PathSelection;
  toReadablePath: ReturnType<typeof createReadablePathResolver>;
}) {
  const initialActivePackageIds = await readActivePackageIdsFromSelection(
    args.selection,
    {
      toReadablePath: args.toReadablePath,
    },
  );
  const profile = args.options.profileId
    ? args.repository.getProfile(args.options.profileId, initialActivePackageIds)
    : args.repository.getCurrentProfile(initialActivePackageIds);

  return {
    initialActivePackageIds,
    profile,
  };
}

function setupFreshCache(options: CliOptions) {
  if (!options.freshCache) {
    return null;
  }

  const cacheRoot = join(
    tmpdir(),
    `rimun-localization-bench-${Date.now()}-${process.pid}`,
  );
  process.env["RIMUN_APP_DATA_DIR"] = cacheRoot;
  return cacheRoot;
}

async function main() {
  const options = parseCliOptions(Bun.argv.slice(2));
  const freshCacheDir = setupFreshCache(options);
  const repository = new SettingsRepository();
  const toReadablePath = createReadablePathResolver();

  try {
    const { selection, source } = resolveSelection(repository, options);
    const { initialActivePackageIds, profile } = await resolveProfileActivePackageIds(
      {
        options,
        repository,
        selection,
        toReadablePath,
      },
    );

    console.log("");
    console.log("=== Localization Benchmark ===");
    console.log(`selectionSource: ${source}`);
    console.log(`profileId: ${profile.id}`);
    console.log(`profileName: ${profile.name}`);
    console.log(`profileActivePackageIds: ${profile.activePackageIds.length}`);
    console.log(`modsConfigActivePackageIds: ${initialActivePackageIds.length}`);
    console.log(`warmRuns: ${options.warmRuns}`);
    console.log(
      `cacheMode: ${freshCacheDir ? `fresh (${freshCacheDir})` : "existing app data"}`,
    );
    console.log("");
    console.log("Paths:");
    logPathValidation(
      "installation",
      "installation",
      selection.channel,
      selection.installationPath,
    );
    logPathValidation(
      "workshop",
      "workshop",
      selection.channel,
      selection.workshopPath,
    );
    logPathValidation("config", "config", selection.channel, selection.configPath);

    console.log("");
    console.log("=== Snapshot Scan ===");
    const snapshotStartedAt = performance.now();
    const snapshot = await readModSourceSnapshot(selection, {
      activePackageIdsOverride: profile.activePackageIds,
      toReadablePath,
    });
    const snapshotElapsedMs = performance.now() - snapshotStartedAt;

    console.log(`snapshotMs: ${formatMs(snapshotElapsedMs)}`);
    console.log(`mods: ${snapshot.entries.length}`);
    console.log(`gameVersion: ${snapshot.gameVersion ?? "<unknown>"}`);
    console.log(
      `currentGameLanguage: ${snapshot.currentGameLanguage.folderName ?? "<unknown>"}`,
    );
    console.log(`snapshotErrors: ${snapshot.errors.length}`);
    logErrors(snapshot.errors);

    if (snapshot.requiresConfiguration) {
      throw new Error("Snapshot requires configuration before benchmarking.");
    }

    if (snapshot.entries.length === 0) {
      throw new Error("No mod entries were scanned, so localization cannot be benchmarked.");
    }

    console.log("");
    console.log("=== Localization Runs ===");
    const coldRun = await runLocalizationBenchmark({
      resetBeforeRun: true,
      selection,
      snapshot,
      toReadablePath,
    });

    console.log(
      `coldRun: ms=${formatMs(coldRun.elapsedMs)} progressEvents=${coldRun.progressEventCount} ${formatKindCounts(coldRun.kindCounts)}`,
    );
    console.log(
      `coldStats: descriptorHits=${coldRun.stats.descriptorCacheHits} descriptorMisses=${coldRun.stats.descriptorCacheMisses} descriptorDbHits=${coldRun.stats.descriptorDbHits} descriptorDbMisses=${coldRun.stats.descriptorDbMisses} descriptorDbHydrateMs=${formatMs(coldRun.stats.descriptorDbHydrateMs)} languageInventoryMs=${formatMs(coldRun.stats.languageInventoryMs)} defsHits=${coldRun.stats.defsCacheHits} defsMisses=${coldRun.stats.defsCacheMisses} defsDbHydrateMs=${formatMs(coldRun.stats.defsDbHydrateMs)} defsInventoryMs=${formatMs(coldRun.stats.defsInventoryMs)} descriptorBuildMs=${formatMs(coldRun.stats.descriptorBuildMs)} providerBitmapMs=${formatMs(coldRun.stats.providerBitmapBuildMs)} statusComputeMs=${formatMs(coldRun.stats.statusComputeMs)} analyzeMs=${formatMs(coldRun.stats.lastAnalyzeMs)}`,
    );

    const warmRuns: BenchmarkRunResult[] = [];

    for (let index = 0; index < options.warmRuns; index += 1) {
      warmRuns.push(
        await runLocalizationBenchmark({
          resetBeforeRun: false,
          selection,
          snapshot,
          toReadablePath,
        }),
      );
    }

    for (const [index, run] of warmRuns.entries()) {
      console.log(
        `warmRun#${index + 1}: ms=${formatMs(run.elapsedMs)} progressEvents=${run.progressEventCount} ${formatKindCounts(run.kindCounts)}`,
      );
      console.log(
        `warmStats#${index + 1}: descriptorHits=${run.stats.descriptorCacheHits} descriptorMisses=${run.stats.descriptorCacheMisses} descriptorDbHits=${run.stats.descriptorDbHits} descriptorDbMisses=${run.stats.descriptorDbMisses} descriptorDbHydrateMs=${formatMs(run.stats.descriptorDbHydrateMs)} languageInventoryMs=${formatMs(run.stats.languageInventoryMs)} defsHits=${run.stats.defsCacheHits} defsMisses=${run.stats.defsCacheMisses} defsDbHydrateMs=${formatMs(run.stats.defsDbHydrateMs)} defsInventoryMs=${formatMs(run.stats.defsInventoryMs)} descriptorBuildMs=${formatMs(run.stats.descriptorBuildMs)} providerBitmapMs=${formatMs(run.stats.providerBitmapBuildMs)} statusComputeMs=${formatMs(run.stats.statusComputeMs)} analyzeMs=${formatMs(run.stats.lastAnalyzeMs)}`,
      );
    }

    if (warmRuns.length > 0) {
      const warmAverageMs =
        warmRuns.reduce((sum, run) => sum + run.elapsedMs, 0) / warmRuns.length;
      const warmBestMs = Math.min(...warmRuns.map((run) => run.elapsedMs));

      console.log("");
      console.log("=== Summary ===");
      console.log(`coldMs: ${formatMs(coldRun.elapsedMs)}`);
      console.log(`warmAvgMs: ${formatMs(warmAverageMs)}`);
      console.log(`warmBestMs: ${formatMs(warmBestMs)}`);
      console.log(
        `deltaMs: ${formatMs(coldRun.elapsedMs - warmAverageMs)} (cold - warmAvg)`,
      );
    }
  } finally {
    resetModLocalizationPerfStateForTests();
    resetModScanPerfStateForTests();
    repository.close();
  }
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error("");
  console.error("Localization benchmark failed.");
  console.error(message);
  process.exit(1);
});
