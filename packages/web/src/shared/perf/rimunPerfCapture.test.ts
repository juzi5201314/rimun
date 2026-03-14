import {
  createRimunPerfCapture,
  installRimunPerfCapture,
  shouldEnableRimunPerfCapture,
} from "@/shared/perf/rimunPerfCapture";
import { describe, expect, it } from "vitest";

function createMockTarget() {
  let nowMs = 0;
  let nextRafHandle = 1;
  const rafCallbacks = new Map<number, FrameRequestCallback>();
  const observers = new Set<MockPerformanceObserver>();

  class MockPerformanceObserver {
    private readonly callback: ConstructorParameters<
      typeof PerformanceObserver
    >[0];

    constructor(
      callback: ConstructorParameters<typeof PerformanceObserver>[0],
    ) {
      this.callback = callback;
      observers.add(this);
    }

    disconnect() {
      observers.delete(this);
    }

    observe() {}

    takeRecords(): PerformanceEntryList {
      return [] as unknown as PerformanceEntryList;
    }

    emit(entries: PerformanceEntry[]) {
      this.callback(
        {
          getEntries: () => entries,
        } as PerformanceObserverEntryList,
        this as unknown as PerformanceObserver,
      );
    }
  }

  return {
    advanceFrame(timestampMs: number) {
      nowMs = timestampMs;
      const currentCallbacks = [...rafCallbacks.values()];
      rafCallbacks.clear();

      for (const callback of currentCallbacks) {
        callback(timestampMs);
      }
    },
    emitLongTask(entry: {
      duration: number;
      name: string;
      startTime: number;
    }) {
      const performanceEntry = {
        duration: entry.duration,
        entryType: "longtask",
        name: entry.name,
        startTime: entry.startTime,
      } as PerformanceEntry;

      for (const observer of observers) {
        observer.emit([performanceEntry]);
      }
    },
    setNow(timestampMs: number) {
      nowMs = timestampMs;
    },
    target: {
      cancelAnimationFrame(handle: number) {
        rafCallbacks.delete(handle);
      },
      performance: {
        now: () => nowMs,
      },
      PerformanceObserver:
        MockPerformanceObserver as unknown as typeof PerformanceObserver,
      requestAnimationFrame(callback: FrameRequestCallback) {
        const handle = nextRafHandle;
        nextRafHandle += 1;
        rafCallbacks.set(handle, callback);
        return handle;
      },
    },
  };
}

describe("rimunPerfCapture", () => {
  it("captures longtask entries and rAF pacing summaries", () => {
    const mockTarget = createMockTarget();
    const capture = createRimunPerfCapture(mockTarget.target);

    capture.start("drag-window");

    mockTarget.advanceFrame(0);
    mockTarget.advanceFrame(18);
    mockTarget.emitLongTask({
      duration: 72,
      name: "self",
      startTime: 12,
    });
    mockTarget.emitLongTask({
      duration: 49,
      name: "ignored-short-task",
      startTime: 30,
    });
    mockTarget.advanceFrame(36);
    mockTarget.advanceFrame(64);
    mockTarget.setNow(96);

    const summary = capture.stop();

    expect(summary).toMatchObject({
      durationMs: 96,
      label: "drag-window",
      longtask: {
        count: 1,
        entries: [
          {
            durationMs: 72,
            entryType: "longtask",
            name: "self",
            startTimeMs: 12,
          },
        ],
        maxDurationMs: 72,
        supported: true,
        totalDurationMs: 72,
      },
      raf: {
        count: 3,
        maxMs: 28,
        p50Ms: 18,
        p95Ms: 28,
        supported: true,
      },
      startedAtMs: 0,
    });
    expect(summary.raf.samplesMs).toEqual([18, 18, 28]);
    expect(
      summary.raf.histogram.find((bucket) => bucket.maxInclusiveMs === 20),
    ).toEqual({ count: 2, maxInclusiveMs: 20 });
    expect(
      summary.raf.histogram.find((bucket) => bucket.maxInclusiveMs === 33),
    ).toEqual({ count: 1, maxInclusiveMs: 33 });
    expect(capture.getLastCapture()).toEqual(summary);
  });

  it("installs a singleton helper and gates it to dev/test modes", () => {
    const mockTarget = createMockTarget();

    expect(
      shouldEnableRimunPerfCapture({ DEV: true, MODE: "development" }),
    ).toBe(true);
    expect(shouldEnableRimunPerfCapture({ DEV: false, MODE: "test" })).toBe(
      true,
    );
    expect(
      shouldEnableRimunPerfCapture({ DEV: false, MODE: "production" }),
    ).toBe(false);

    const firstInstall = installRimunPerfCapture(mockTarget.target);
    const secondInstall = installRimunPerfCapture(mockTarget.target);

    expect(secondInstall).toBe(firstInstall);
    expect(
      (mockTarget.target as { __rimunPerfCapture?: unknown })
        .__rimunPerfCapture,
    ).toBe(firstInstall);
  });
});
