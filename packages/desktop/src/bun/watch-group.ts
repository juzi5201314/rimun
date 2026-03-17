import { type FSWatcher, watch } from "node:fs";

export type WatchGroup = {
  close(): void;
  hasSetupFailures: boolean;
  watchedPaths: string[];
};

type WatchGroupCreateOptions = {
  label?: string;
};

type WatchGroupPerfBucket = {
  deferredGroups: number;
  groups: number;
  pathCount: number;
  setupFailures: number;
  setupMs: number;
};

const watchGroupPerfBuckets = new Map<string, WatchGroupPerfBucket>();

function getOrCreatePerfBucket(label: string) {
  const existing = watchGroupPerfBuckets.get(label);

  if (existing) {
    return existing;
  }

  const next: WatchGroupPerfBucket = {
    deferredGroups: 0,
    groups: 0,
    pathCount: 0,
    setupFailures: 0,
    setupMs: 0,
  };
  watchGroupPerfBuckets.set(label, next);
  return next;
}

function recordWatchGroupPerf(args: {
  deferred: boolean;
  hadFailure: boolean;
  label: string;
  pathCount: number;
  setupMs: number;
}) {
  const bucket = getOrCreatePerfBucket(args.label);
  bucket.groups += 1;
  bucket.pathCount += args.pathCount;
  bucket.setupMs += args.setupMs;

  if (args.deferred) {
    bucket.deferredGroups += 1;
  }

  if (args.hadFailure) {
    bucket.setupFailures += 1;
  }
}

export function createWatchGroup(
  paths: Iterable<string>,
  onDirty: (path: string) => void,
  options: WatchGroupCreateOptions = {},
): WatchGroup {
  const watchedPaths = [...new Set([...paths].filter(Boolean))].sort();
  const label = options.label ?? "default";
  const watchers: FSWatcher[] = [];
  let hasSetupFailures = false;
  let isClosed = false;

  const installWatchers = () => {
    if (isClosed) {
      return;
    }

    const setupStart = performance.now();
    let installFailed = false;

    for (const path of watchedPaths) {
      try {
        const watcher = watch(
          path,
          {
            persistent: false,
          },
          () => {
            onDirty(path);
          },
        );

        watcher.on("error", () => {
          if (!isClosed) {
            onDirty(path);
          }
        });
        watchers.push(watcher);
      } catch {
        installFailed = true;
      }
    }

    hasSetupFailures = hasSetupFailures || installFailed;
    recordWatchGroupPerf({
      deferred: false,
      hadFailure: installFailed,
      label,
      pathCount: watchedPaths.length,
      setupMs: performance.now() - setupStart,
    });

    if (installFailed && !isClosed) {
      onDirty(watchedPaths[0] ?? "");
    }
  };

  installWatchers();

  return {
    close() {
      isClosed = true;

      for (const watcher of watchers) {
        watcher.close();
      }
    },
    get hasSetupFailures() {
      return hasSetupFailures;
    },
    watchedPaths,
  };
}

export function getWatchGroupPerfStatsForTests() {
  return [...watchGroupPerfBuckets.entries()]
    .map(([label, bucket]) => ({
      ...bucket,
      label,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function resetWatchGroupPerfStatsForTests() {
  watchGroupPerfBuckets.clear();
}
