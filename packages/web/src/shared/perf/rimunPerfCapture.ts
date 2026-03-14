type PerfCaptureEntry = Pick<
  PerformanceEntry,
  "entryType" | "name" | "startTime" | "duration"
>;

type PerfCaptureObserverCallback = ConstructorParameters<
  typeof PerformanceObserver
>[0];

type PerfCaptureTarget = {
  __rimunPerfCapture?: RimunPerfCaptureApi;
  PerformanceObserver?: {
    new (callback: PerfCaptureObserverCallback): PerformanceObserver;
  };
  cancelAnimationFrame?: (handle: number) => void;
  performance?: Pick<Performance, "now">;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
};

type ActivePerfCapture = {
  label: string | null;
  longtaskEntries: PerfCaptureLongTaskEntry[];
  longtaskObserver: PerformanceObserver | null;
  rafDeltasMs: number[];
  rafHandle: number | null;
  rafPreviousTimestamp: number | null;
  startedAtMs: number;
};

export type RimunPerfCaptureSummary = {
  durationMs: number;
  endedAtMs: number;
  label: string | null;
  longtask: {
    count: number;
    entries: PerfCaptureLongTaskEntry[];
    maxDurationMs: number;
    supported: boolean;
    totalDurationMs: number;
  };
  raf: {
    count: number;
    histogram: PerfCaptureHistogramBucket[];
    maxMs: number;
    p50Ms: number;
    p95Ms: number;
    samplesMs: number[];
    supported: boolean;
  };
  startedAtMs: number;
};

export type RimunPerfCaptureApi = {
  getLastCapture: () => RimunPerfCaptureSummary | null;
  isCapturing: () => boolean;
  reset: () => void;
  start: (label?: string) => void;
  stop: () => RimunPerfCaptureSummary;
};

export type PerfCaptureLongTaskEntry = {
  durationMs: number;
  entryType: string;
  name: string;
  startTimeMs: number;
};

export type PerfCaptureHistogramBucket = {
  count: number;
  maxInclusiveMs: number | null;
};

const LONGTASK_MIN_DURATION_MS = 50;
const HISTOGRAM_BUCKET_LIMITS_MS = [
  8, 12, 16, 20, 25, 33, 50, 100, 150,
] as const;

declare global {
  interface Window {
    __rimunPerfCapture?: RimunPerfCaptureApi;
  }
}

export function shouldEnableRimunPerfCapture(env: {
  DEV?: boolean;
  MODE?: string;
}): boolean {
  return env.DEV === true || env.MODE === "test";
}

export function installRimunPerfCapture(
  target: PerfCaptureTarget = window,
): RimunPerfCaptureApi {
  if (target.__rimunPerfCapture) {
    return target.__rimunPerfCapture;
  }

  const api = createRimunPerfCapture(target);
  target.__rimunPerfCapture = api;
  return api;
}

export function createRimunPerfCapture(
  target: PerfCaptureTarget,
): RimunPerfCaptureApi {
  let activeCapture: ActivePerfCapture | null = null;
  let lastCapture: RimunPerfCaptureSummary | null = null;

  const supportsLongTaskObserver =
    typeof target.PerformanceObserver === "function";
  const supportsRaf =
    typeof target.requestAnimationFrame === "function" &&
    typeof target.cancelAnimationFrame === "function";

  const collectLongTaskEntries = (entries: PerfCaptureEntry[]) => {
    if (!activeCapture) {
      return;
    }

    for (const entry of entries) {
      if (
        entry.entryType !== "longtask" ||
        entry.duration < LONGTASK_MIN_DURATION_MS
      ) {
        continue;
      }

      activeCapture.longtaskEntries.push({
        durationMs: roundMs(entry.duration),
        entryType: entry.entryType,
        name: entry.name,
        startTimeMs: roundMs(entry.startTime),
      });
    }
  };

  const tick: FrameRequestCallback = (timestamp) => {
    if (!activeCapture || !supportsRaf || !target.requestAnimationFrame) {
      return;
    }

    if (activeCapture.rafPreviousTimestamp !== null) {
      activeCapture.rafDeltasMs.push(
        roundMs(timestamp - activeCapture.rafPreviousTimestamp),
      );
    }

    activeCapture.rafPreviousTimestamp = timestamp;
    activeCapture.rafHandle = target.requestAnimationFrame(tick);
  };

  return {
    getLastCapture() {
      return lastCapture;
    },
    isCapturing() {
      return activeCapture !== null;
    },
    reset() {
      if (activeCapture) {
        if (activeCapture.rafHandle !== null) {
          target.cancelAnimationFrame?.(activeCapture.rafHandle);
        }

        activeCapture.longtaskObserver?.disconnect();
      }

      activeCapture = null;
      lastCapture = null;
    },
    start(label) {
      if (activeCapture) {
        throw new Error("A Rimun performance capture is already in progress.");
      }

      const longtaskObserver =
        supportsLongTaskObserver && target.PerformanceObserver
          ? new target.PerformanceObserver((entryList) => {
              collectLongTaskEntries(
                entryList.getEntries() as PerfCaptureEntry[],
              );
            })
          : null;

      if (longtaskObserver) {
        try {
          longtaskObserver.observe({ entryTypes: ["longtask"] });
        } catch {
          longtaskObserver.disconnect();
        }
      }

      activeCapture = {
        label: label ?? null,
        longtaskEntries: [],
        longtaskObserver,
        rafDeltasMs: [],
        rafHandle: null,
        rafPreviousTimestamp: null,
        startedAtMs: getNow(target),
      };

      if (supportsRaf && target.requestAnimationFrame) {
        activeCapture.rafHandle = target.requestAnimationFrame(tick);
      }
    },
    stop() {
      if (!activeCapture) {
        throw new Error("No Rimun performance capture is currently running.");
      }

      const capture = activeCapture;

      if (
        supportsRaf &&
        target.cancelAnimationFrame &&
        capture.rafHandle !== null
      ) {
        target.cancelAnimationFrame(capture.rafHandle);
      }

      if (capture.longtaskObserver) {
        collectLongTaskEntries(
          capture.longtaskObserver.takeRecords() as PerfCaptureEntry[],
        );
        capture.longtaskObserver.disconnect();
      }

      activeCapture = null;

      lastCapture = summarizeCapture({
        endedAtMs: getNow(target),
        label: capture.label,
        longtaskEntries: capture.longtaskEntries,
        rafDeltasMs: capture.rafDeltasMs,
        startedAtMs: capture.startedAtMs,
        supportsLongTaskObserver,
        supportsRaf,
      });

      return lastCapture;
    },
  };
}

function summarizeCapture(input: {
  endedAtMs: number;
  label: string | null;
  longtaskEntries: PerfCaptureLongTaskEntry[];
  rafDeltasMs: number[];
  startedAtMs: number;
  supportsLongTaskObserver: boolean;
  supportsRaf: boolean;
}): RimunPerfCaptureSummary {
  const sortedRafDeltasMs = [...input.rafDeltasMs].sort(
    (left, right) => left - right,
  );
  const rafMaxMs = sortedRafDeltasMs.at(-1) ?? 0;
  const longtaskMaxDurationMs = Math.max(
    0,
    ...input.longtaskEntries.map((entry) => entry.durationMs),
  );

  return {
    durationMs: roundMs(input.endedAtMs - input.startedAtMs),
    endedAtMs: roundMs(input.endedAtMs),
    label: input.label,
    longtask: {
      count: input.longtaskEntries.length,
      entries: input.longtaskEntries,
      maxDurationMs: roundMs(longtaskMaxDurationMs),
      supported: input.supportsLongTaskObserver,
      totalDurationMs: roundMs(
        input.longtaskEntries.reduce((sum, entry) => sum + entry.durationMs, 0),
      ),
    },
    raf: {
      count: input.rafDeltasMs.length,
      histogram: buildHistogram(input.rafDeltasMs),
      maxMs: roundMs(rafMaxMs),
      p50Ms: percentile(sortedRafDeltasMs, 0.5),
      p95Ms: percentile(sortedRafDeltasMs, 0.95),
      samplesMs: input.rafDeltasMs,
      supported: input.supportsRaf,
    },
    startedAtMs: roundMs(input.startedAtMs),
  };
}

function buildHistogram(valuesMs: number[]): PerfCaptureHistogramBucket[] {
  const buckets = HISTOGRAM_BUCKET_LIMITS_MS.map((limit) => ({
    count: 0,
    maxInclusiveMs: limit,
  }));
  const overflowBucket: PerfCaptureHistogramBucket = {
    count: 0,
    maxInclusiveMs: null,
  };

  for (const value of valuesMs) {
    const bucket = buckets.find(
      (candidate) => value <= candidate.maxInclusiveMs,
    );
    if (bucket) {
      bucket.count += 1;
    } else {
      overflowBucket.count += 1;
    }
  }

  return [...buckets, overflowBucket];
}

function percentile(sortedValuesMs: number[], percentileValue: number): number {
  if (sortedValuesMs.length === 0) {
    return 0;
  }

  const index = Math.max(
    0,
    Math.ceil(sortedValuesMs.length * percentileValue) - 1,
  );
  return roundMs(sortedValuesMs[index] ?? 0);
}

function getNow(target: PerfCaptureTarget): number {
  return target.performance?.now() ?? Date.now();
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
