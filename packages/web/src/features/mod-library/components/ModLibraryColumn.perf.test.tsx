import { ModLibraryColumn } from "@/features/mod-library/components/ModLibraryColumn";
import type { HomePageModListItem } from "@/features/mod-library/hooks/useHomePageController";
import type { ModColumnId } from "@/features/mod-library/lib/mod-list-order";
import { I18nProvider } from "@/shared/i18n";
import { DndContext } from "@dnd-kit/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ITEM_COUNT = 2_000;
const DOM_CAP = 48;
const MOVED_PACKAGE_ID = "rimun.test.0500";
const ACTIVE_INSERT_BEFORE_PACKAGE_ID = "rimun.test.1000";

type SourceFilter = "all" | "local" | "workshop";

const originalGetBoundingClientRect =
  HTMLElement.prototype.getBoundingClientRect;
const originalResizeObserver = globalThis.ResizeObserver;
const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);
const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);
const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientHeight",
);
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "clientWidth",
);

beforeEach(() => {
  class MockResizeObserver implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}

    observe(target: Element) {
      const height =
        target instanceof HTMLElement &&
        target.getAttribute("data-testid") === "mod-library-column-scroll"
          ? 720
          : 74;

      this.callback(
        [
          {
            borderBoxSize: [] as ResizeObserverSize[],
            contentBoxSize: [] as ResizeObserverSize[],
            contentRect: new DOMRect(0, 0, 640, height),
            devicePixelContentBoxSize: [] as ResizeObserverSize[],
            target,
          },
        ] as ResizeObserverEntry[],
        this,
      );
    }

    disconnect() {}

    unobserve() {}
  }

  globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;

  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function offsetHeight(this: HTMLElement) {
      const testId = this.getAttribute("data-testid");

      if (testId === "mod-library-column-scroll") {
        return 720;
      }

      if (testId === "mod-library-row") {
        return 74;
      }

      return offsetHeightDescriptor?.get?.call(this) ?? 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
    function offsetWidth(this: HTMLElement) {
      if (this.getAttribute("data-testid") === "mod-library-column-scroll") {
        return 640;
      }

      return offsetWidthDescriptor?.get?.call(this) ?? 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function clientHeight(this: HTMLElement) {
      if (this.getAttribute("data-testid") === "mod-library-column-scroll") {
        return 720;
      }

      return clientHeightDescriptor?.get?.call(this) ?? 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function clientWidth(this: HTMLElement) {
      if (this.getAttribute("data-testid") === "mod-library-column-scroll") {
        return 640;
      }

      return clientWidthDescriptor?.get?.call(this) ?? 0;
    },
  );

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      const testId = this.getAttribute("data-testid");

      if (testId === "mod-library-column-scroll") {
        return new DOMRect(0, 0, 640, 720);
      }

      if (testId === "mod-library-row") {
        return new DOMRect(0, 0, 640, 74);
      }

      return originalGetBoundingClientRect.call(this);
    },
  );
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
});

async function teardownPerfHarness(unmount: () => void) {
  unmount();
  await waitFor(() => {
    expect(screen.queryAllByTestId("mod-library-column")).toHaveLength(0);
  });
  cleanup();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

function createSyntheticItem(index: number): HomePageModListItem {
  const packageId = `rimun.test.${String(index).padStart(4, "0")}`;
  const isActive = index >= ITEM_COUNT / 2;
  const source = index % 2 === 0 ? "installation" : "workshop";
  const name = `Mod ${String(index).padStart(4, "0")}`;

  return {
    author: "Rimun Perf",
    columnId: isActive ? "active" : "inactive",
    dependencyMetadata: {
      dependencies: [],
      forceLoadAfter: [],
      forceLoadBefore: [],
      incompatibleWith: [],
      loadAfter: [],
      loadBefore: [],
      packageIdNormalized: packageId,
      supportedVersions: ["1.5"],
    },
    description: null,
    dragDisabledReason: null,
    enabled: isActive,
    hasAboutXml: true,
    id: `mod-${index}`,
    isDraggable: true,
    isOfficial: false,
    manifestPath: `C:\\RimWorld\\Mods\\${String(index).padStart(4, "0")}\\About\\About.xml`,
    name,
    notes: [],
    orderLabel: isActive ? index - ITEM_COUNT / 2 + 1 : null,
    packageId,
    packageIdNormalized: packageId,
    searchText: `${name} rimun perf ${packageId}`.toLowerCase(),
    source,
    version: "1.5",
    windowsPath: `C:\\RimWorld\\Mods\\${String(index).padStart(4, "0")}`,
    wslPath: `/mnt/c/RimWorld/Mods/${String(index).padStart(4, "0")}`,
  };
}

function createInitialColumns() {
  return {
    active: SYNTHETIC_ITEMS.slice(ITEM_COUNT / 2),
    inactive: SYNTHETIC_ITEMS.slice(0, ITEM_COUNT / 2),
  };
}

const SYNTHETIC_ITEMS = Array.from({ length: ITEM_COUNT }, (_, index) =>
  createSyntheticItem(index),
);

function isVisibleMod(
  item: HomePageModListItem,
  sourceFilter: SourceFilter,
  term: string,
) {
  if (sourceFilter === "local" && item.source !== "installation") {
    return false;
  }

  if (sourceFilter === "workshop" && item.source !== "workshop") {
    return false;
  }

  if (!term) {
    return true;
  }

  return item.searchText.includes(term);
}

function getColumn(columnId: ModColumnId) {
  const column = screen
    .getAllByTestId("mod-library-column")
    .find((candidate) => candidate.getAttribute("data-column-id") === columnId);

  if (!column) {
    throw new Error(`Missing ${columnId} column`);
  }

  return column;
}

function getColumnScroll(columnId: ModColumnId) {
  const scrollContainer = screen
    .getAllByTestId("mod-library-column-scroll")
    .find((candidate) => candidate.getAttribute("data-column-id") === columnId);

  if (!scrollContainer) {
    throw new Error(`Missing ${columnId} scroll container`);
  }

  return scrollContainer;
}

async function expectRenderedRowsWithinCap(
  columnId: ModColumnId,
  phase: string,
) {
  await waitFor(() => {
    const rendered = within(getColumn(columnId)).queryAllByTestId(
      "mod-library-row",
    ).length;

    expect(rendered).toBeGreaterThan(0);

    if (rendered > DOM_CAP) {
      throw new Error(
        `VAL-PERF-001 ${phase}: items=${ITEM_COUNT} column=${columnId} rendered=${rendered} cap=${DOM_CAP}`,
      );
    }
  });
}

async function expectRenderedColumnsWithinCap(
  checks: Array<{ columnId: ModColumnId; phase: string }>,
) {
  await waitFor(() => {
    for (const { columnId, phase } of checks) {
      const rendered = within(getColumn(columnId)).queryAllByTestId(
        "mod-library-row",
      ).length;

      expect(rendered).toBeGreaterThan(0);

      if (rendered > DOM_CAP) {
        throw new Error(
          `VAL-PERF-001 ${phase}: items=${ITEM_COUNT} column=${columnId} rendered=${rendered} cap=${DOM_CAP}`,
        );
      }
    }
  });
}

function ModLibraryPerfHarness() {
  const [columns, setColumns] = useState(createInitialColumns);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const term = searchQuery.trim().toLowerCase();
  const visibleInactiveMods = useMemo(
    () =>
      columns.inactive.filter((item) => isVisibleMod(item, sourceFilter, term)),
    [columns.inactive, sourceFilter, term],
  );
  const visibleActiveMods = useMemo(
    () =>
      columns.active.filter((item) => isVisibleMod(item, sourceFilter, term)),
    [columns.active, sourceFilter, term],
  );

  return (
    <DndContext>
      <div>
        <label>
          Search mods
          <input
            aria-label="Search mods"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSourceFilter("all");
            }}
          >
            Clear filters
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("3");
              setSourceFilter("local");
            }}
          >
            Apply local search filters
          </button>
          <button type="button" onClick={() => setSourceFilter("workshop")}>
            Workshop only
          </button>
          <button
            type="button"
            onClick={() => {
              setColumns((current) => {
                const inactiveIndex = current.inactive.findIndex(
                  (item) => item.packageIdNormalized === MOVED_PACKAGE_ID,
                );

                if (inactiveIndex < 0) {
                  return current;
                }

                const movingItem = current.inactive[inactiveIndex];
                const nextInactive = current.inactive.filter(
                  (item) => item.packageIdNormalized !== MOVED_PACKAGE_ID,
                );
                const nextActive = [...current.active];
                const targetIndex = nextActive.findIndex(
                  (item) =>
                    item.packageIdNormalized ===
                    ACTIVE_INSERT_BEFORE_PACKAGE_ID,
                );

                const nextIndex = targetIndex >= 0 ? targetIndex : 0;
                const nextMovingItem = {
                  ...movingItem,
                  columnId: "active" as const,
                  enabled: true,
                  orderLabel: nextIndex + 1,
                };

                nextActive.splice(nextIndex, 0, nextMovingItem);

                return {
                  active: nextActive,
                  inactive: nextInactive,
                };
              });
            }}
          >
            Move inactive mod to active
          </button>
        </div>

        <div className="grid h-[840px] grid-cols-2 gap-4">
          <ModLibraryColumn
            activeDragPackageId={null}
            columnId="inactive"
            description="Inactive synthetic mods"
            dropIndicator={null}
            items={visibleInactiveMods}
            selectedModId={null}
            title="Inactive Mods"
            totalCount={columns.inactive.length}
            onSelectMod={() => {}}
          />
          <ModLibraryColumn
            activeDragPackageId={null}
            columnId="active"
            description="Active synthetic mods"
            dropIndicator={null}
            items={visibleActiveMods}
            selectedModId={null}
            title="Active Mods"
            totalCount={columns.active.length}
            onSelectMod={() => {}}
          />
        </div>
      </div>
    </DndContext>
  );
}

describe("ModLibraryColumn perf guardrails", () => {
  it("VAL-PERF-001 keeps rendered DOM rows bounded for items=2000 at rest and after scrolling", async () => {
    const view = render(
      <I18nProvider>
        <ModLibraryPerfHarness />
      </I18nProvider>,
    );

    try {
      await expectRenderedColumnsWithinCap([
        { columnId: "inactive", phase: "at-rest inactive" },
        { columnId: "active", phase: "at-rest active" },
      ]);

      const activeScroll = getColumnScroll("active");
      activeScroll.scrollTop = 74 * 900;
      fireEvent.scroll(activeScroll);

      await expectRenderedRowsWithinCap("active", "after-scroll");
    } finally {
      await teardownPerfHarness(view.unmount);
    }
  });

  it("VAL-PERF-001 keeps rendered DOM rows bounded for items=2000 after toggling filters", async () => {
    const view = render(
      <I18nProvider>
        <ModLibraryPerfHarness />
      </I18nProvider>,
    );

    try {
      await expectRenderedColumnsWithinCap([
        { columnId: "inactive", phase: "before-filters inactive" },
        { columnId: "active", phase: "before-filters active" },
      ]);

      const activeScroll = getColumnScroll("active");
      const inactiveScroll = getColumnScroll("inactive");

      fireEvent.click(
        screen.getByRole("button", { name: /Apply local search filters/i }),
      );

      activeScroll.scrollTop = 0;
      fireEvent.scroll(activeScroll);
      inactiveScroll.scrollTop = 0;
      fireEvent.scroll(inactiveScroll);

      await expectRenderedColumnsWithinCap([
        {
          columnId: "inactive",
          phase: "after-source-and-search-filters inactive",
        },
        {
          columnId: "active",
          phase: "after-source-and-search-filters active",
        },
      ]);

      fireEvent.click(screen.getByRole("button", { name: /Clear filters/i }));

      activeScroll.scrollTop = 0;
      fireEvent.scroll(activeScroll);
      inactiveScroll.scrollTop = 0;
      fireEvent.scroll(inactiveScroll);

      await expectRenderedColumnsWithinCap([
        { columnId: "inactive", phase: "after-clearing-filters inactive" },
        { columnId: "active", phase: "after-clearing-filters active" },
      ]);
    } finally {
      await teardownPerfHarness(view.unmount);
    }
  });

  it("VAL-PERF-001 keeps rendered DOM rows bounded for items=2000 after a cross-column move", async () => {
    const view = render(
      <I18nProvider>
        <ModLibraryPerfHarness />
      </I18nProvider>,
    );

    try {
      await expectRenderedColumnsWithinCap([
        { columnId: "inactive", phase: "before-cross-column-move inactive" },
        { columnId: "active", phase: "before-cross-column-move active" },
      ]);

      fireEvent.click(
        screen.getByRole("button", { name: /Move inactive mod to active/i }),
      );

      await waitFor(() => {
        within(getColumn("active")).getByText("Mod 0500");
      });

      await expectRenderedColumnsWithinCap([
        {
          columnId: "inactive",
          phase: "after-cross-column-move inactive",
        },
        { columnId: "active", phase: "after-cross-column-move active" },
      ]);
    } finally {
      await teardownPerfHarness(view.unmount);
    }
  });
});
