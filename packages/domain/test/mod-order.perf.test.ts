import { describe, expect, it } from "bun:test";
import type { ModLibraryResult, ModRecord } from "@rimun/shared";
import { analyzeModOrder } from "../src/index";

const ITEM_COUNT = 2_000;
const WORK_UNIT_CAP = 20_000;

type CountedArrayMethod =
  | "filter"
  | "flatMap"
  | "includes"
  | "map"
  | "some"
  | "sort";

type MethodCounter = {
  calls: number;
  units: number;
};

type WorkCounters = Record<CountedArrayMethod, MethodCounter>;
type AnyArrayMethod = (this: unknown[], ...args: unknown[]) => unknown;

function createSyntheticMod(index: number): ModRecord {
  const packageId =
    index === 0
      ? "ludeon.rimworld"
      : `rimun.test.${String(index).padStart(4, "0")}`;
  const previousPackageId =
    index <= 1
      ? "ludeon.rimworld"
      : `rimun.test.${String(index - 1).padStart(4, "0")}`;
  const twoBackPackageId =
    index <= 2 ? null : `rimun.test.${String(index - 2).padStart(4, "0")}`;

  return {
    id: `mod-${index}`,
    name: index === 0 ? "Core" : `Perf Mod ${String(index).padStart(4, "0")}`,
    packageId,
    author: "Rimun Perf",
    version: "1.5",
    description: null,
    source: index % 2 === 0 ? "installation" : "workshop",
    windowsPath: `C:\\RimWorld\\Mods\\${String(index).padStart(4, "0")}`,
    wslPath: `/mnt/c/RimWorld/Mods/${String(index).padStart(4, "0")}`,
    manifestPath: `C:\\RimWorld\\Mods\\${String(index).padStart(4, "0")}\\About\\About.xml`,
    enabled: true,
    isOfficial: index === 0,
    hasAboutXml: true,
    dependencyMetadata: {
      packageIdNormalized: packageId,
      dependencies: index === 0 ? [] : [previousPackageId],
      loadAfter: twoBackPackageId ? [twoBackPackageId] : [],
      loadBefore: [],
      forceLoadAfter: [],
      forceLoadBefore: [],
      incompatibleWith: [],
      supportedVersions: ["1.5"],
    },
    notes: [],
  };
}

function createSyntheticLibrary(): ModLibraryResult {
  const mods = Array.from({ length: ITEM_COUNT }, (_, index) =>
    createSyntheticMod(index),
  );

  return {
    environment: {
      platform: "linux",
      isWsl: true,
      wslDistro: "Ubuntu",
    },
    selection: {
      channel: "steam",
      installationPath: "C:\\Games\\RimWorld",
      workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
      configPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config",
    },
    scannedAt: "2026-03-14T00:00:00.000Z",
    scannedRoots: {
      installationModsPath: "C:\\Games\\RimWorld\\Mods",
      workshopPath: "C:\\Games\\Steam\\steamapps\\workshop\\content\\294100",
      modsConfigPath:
        "C:\\Users\\alice\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config\\ModsConfig.xml",
    },
    gameVersion: "1.5.4104 rev435",
    activePackageIds: mods.map((mod) => mod.packageId ?? mod.id),
    mods,
    errors: [],
    requiresConfiguration: false,
  };
}

function withArrayMethodCounters<T>(run: () => T) {
  const arrayPrototype = Array.prototype as unknown as Record<
    CountedArrayMethod,
    AnyArrayMethod
  >;
  const counters: WorkCounters = {
    filter: { calls: 0, units: 0 },
    flatMap: { calls: 0, units: 0 },
    includes: { calls: 0, units: 0 },
    map: { calls: 0, units: 0 },
    some: { calls: 0, units: 0 },
    sort: { calls: 0, units: 0 },
  };
  const originals = {
    filter: arrayPrototype.filter,
    flatMap: arrayPrototype.flatMap,
    includes: arrayPrototype.includes,
    map: arrayPrototype.map,
    some: arrayPrototype.some,
    sort: arrayPrototype.sort,
  };

  arrayPrototype.filter = function countedFilter(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.filter.calls += 1;
    counters.filter.units += this.length >>> 0;

    return originals.filter.apply(this, args);
  };
  arrayPrototype.flatMap = function countedFlatMap(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.flatMap.calls += 1;
    counters.flatMap.units += this.length >>> 0;

    return originals.flatMap.apply(this, args);
  };
  arrayPrototype.includes = function countedIncludes(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.includes.calls += 1;
    counters.includes.units += this.length >>> 0;

    return originals.includes.apply(this, args);
  };
  arrayPrototype.map = function countedMap(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.map.calls += 1;
    counters.map.units += this.length >>> 0;

    return originals.map.apply(this, args);
  };
  arrayPrototype.some = function countedSome(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.some.calls += 1;
    counters.some.units += this.length >>> 0;

    return originals.some.apply(this, args);
  };
  arrayPrototype.sort = function countedSort(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.sort.calls += 1;
    counters.sort.units += this.length >>> 0;

    return originals.sort.apply(this, args);
  };

  try {
    return {
      result: run(),
      counters,
    };
  } finally {
    arrayPrototype.filter = originals.filter;
    arrayPrototype.flatMap = originals.flatMap;
    arrayPrototype.includes = originals.includes;
    arrayPrototype.map = originals.map;
    arrayPrototype.some = originals.some;
    arrayPrototype.sort = originals.sort;
  }
}

function getTotalWorkUnits(counters: WorkCounters) {
  return Object.values(counters).reduce(
    (total, counter) => total + counter.units,
    0,
  );
}

describe("analyzeModOrder perf guardrails", () => {
  it("VAL-PERF-003 keeps work units bounded for items=2000", () => {
    const run = withArrayMethodCounters(() =>
      analyzeModOrder(createSyntheticLibrary()),
    );
    const totalUnits = getTotalWorkUnits(run.counters);

    console.info(
      `VAL-PERF-003 items=${ITEM_COUNT} totalUnits=${totalUnits} cap=${WORK_UNIT_CAP} counters=${JSON.stringify(run.counters)}`,
    );

    expect(run.result.hasBlockingIssues).toBe(false);
    expect(run.result.recommendedOrderPackageIds).toHaveLength(ITEM_COUNT);
    expect(totalUnits).toBeLessThanOrEqual(WORK_UNIT_CAP);
  });
});
