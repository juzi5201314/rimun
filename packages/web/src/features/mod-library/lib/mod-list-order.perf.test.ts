import { applyDropToDraftModOrder } from "@/features/mod-library/lib/mod-list-order";
import { describe, expect, it } from "vitest";

const ITEM_COUNT = 2_000;
const ACTIVE_COUNT = ITEM_COUNT / 2;
const INACTIVE_COUNT = ITEM_COUNT / 2;
const SAME_COLUMN_CAP = 2_000;
const CROSS_COLUMN_CAP = 3_000;

type CountedArrayMethod = "filter" | "includes" | "indexOf";

type MethodCounter = {
  calls: number;
  units: number;
};

type OperationCounters = Record<CountedArrayMethod, MethodCounter>;
type AnyArrayMethod = (this: unknown[], ...args: unknown[]) => unknown;

function createDraftModOrder() {
  return {
    activePackageIds: Array.from(
      { length: ACTIVE_COUNT },
      (_, index) => `active-${index}`,
    ),
    inactivePackageIds: Array.from(
      { length: INACTIVE_COUNT },
      (_, index) => `inactive-${index}`,
    ),
  };
}

function withArrayMethodCounters<T>(run: () => T) {
  const arrayPrototype = Array.prototype as unknown as Record<
    CountedArrayMethod,
    AnyArrayMethod
  >;
  const counters: OperationCounters = {
    filter: { calls: 0, units: 0 },
    includes: { calls: 0, units: 0 },
    indexOf: { calls: 0, units: 0 },
  };
  const originals = {
    filter: arrayPrototype.filter,
    includes: arrayPrototype.includes,
    indexOf: arrayPrototype.indexOf,
  };

  arrayPrototype.filter = function countedFilter(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.filter.calls += 1;
    counters.filter.units += this.length >>> 0;

    return originals.filter.apply(this, args);
  };
  arrayPrototype.includes = function countedIncludes(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.includes.calls += 1;
    counters.includes.units += this.length >>> 0;

    return originals.includes.apply(this, args);
  };
  arrayPrototype.indexOf = function countedIndexOf(
    this: unknown[],
    ...args: unknown[]
  ) {
    counters.indexOf.calls += 1;
    counters.indexOf.units += this.length >>> 0;

    return originals.indexOf.apply(this, args);
  };

  try {
    return {
      result: run(),
      counters,
    };
  } finally {
    arrayPrototype.filter = originals.filter;
    arrayPrototype.includes = originals.includes;
    arrayPrototype.indexOf = originals.indexOf;
  }
}

function getTotalUnits(counters: OperationCounters) {
  return Object.values(counters).reduce(
    (total, counter) => total + counter.units,
    0,
  );
}

function expectOperationBound(
  label: string,
  counters: OperationCounters,
  cap: number,
) {
  const totalUnits = getTotalUnits(counters);
  console.info(
    `VAL-PERF-002 ${label}: items=${ITEM_COUNT} totalUnits=${totalUnits} cap=${cap} counters=${JSON.stringify(counters)}`,
  );

  expect(
    totalUnits,
    `${label} counters=${JSON.stringify(counters)}`,
  ).toBeLessThanOrEqual(cap);
}

describe("applyDropToDraftModOrder perf guardrails", () => {
  it("VAL-PERF-002 bounds same-column and cross-column work at items=2000", () => {
    const sameColumnRun = withArrayMethodCounters(() =>
      applyDropToDraftModOrder(createDraftModOrder(), {
        packageId: "active-10",
        placement: "after",
        sourceColumn: "active",
        targetColumn: "active",
        targetPackageId: "active-900",
      }),
    );

    expect(sameColumnRun.result.activePackageIds[900]).toBe("active-10");
    expect(sameColumnRun.result.inactivePackageIds).toHaveLength(
      INACTIVE_COUNT,
    );
    expectOperationBound(
      "same-column-reorder",
      sameColumnRun.counters,
      SAME_COLUMN_CAP,
    );

    const crossColumnRun = withArrayMethodCounters(() =>
      applyDropToDraftModOrder(createDraftModOrder(), {
        packageId: "inactive-10",
        placement: "before",
        sourceColumn: "inactive",
        targetColumn: "active",
        targetPackageId: "active-900",
      }),
    );

    expect(crossColumnRun.result.activePackageIds[900]).toBe("inactive-10");
    expect(crossColumnRun.result.inactivePackageIds).toHaveLength(
      INACTIVE_COUNT - 1,
    );
    expectOperationBound(
      "cross-column-move",
      crossColumnRun.counters,
      CROSS_COLUMN_CAP,
    );
  });
});
