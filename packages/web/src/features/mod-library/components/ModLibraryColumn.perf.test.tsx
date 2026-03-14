import { ModLibraryColumn } from "@/features/mod-library/components/ModLibraryColumn";
import type { HomePageModListItem } from "@/features/mod-library/hooks/useHomePageController";
import type { ModColumnId } from "@/features/mod-library/lib/mod-list-order";
import { DndContext } from "@dnd-kit/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  const items = Array.from({ length: ITEM_COUNT }, (_, index) =>
    createSyntheticItem(index),
  );

  return {
    active: items.slice(ITEM_COUNT / 2),
    inactive: items.slice(0, ITEM_COUNT / 2),
  };
}

function normalizeColumnItems(
  items: HomePageModListItem[],
  columnId: ModColumnId,
) {
  return items.map((item, index) => ({
    ...item,
    columnId,
    enabled: columnId === "active",
    orderLabel: columnId === "active" ? index + 1 : null,
  }));
}

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
          <button type="button" onClick={() => setSourceFilter("all")}>
            All sources
          </button>
          <button type="button" onClick={() => setSourceFilter("local")}>
            Local only
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

                nextActive.splice(
                  targetIndex >= 0 ? targetIndex : 0,
                  0,
                  movingItem,
                );

                return {
                  active: normalizeColumnItems(nextActive, "active"),
                  inactive: normalizeColumnItems(nextInactive, "inactive"),
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
  it("VAL-PERF-001 keeps rendered DOM rows bounded for items=2000 across scroll, filter toggles, and cross-column move", async () => {
    const view = render(<ModLibraryPerfHarness />);

    try {
      await expectRenderedRowsWithinCap("inactive", "at-rest inactive");
      await expectRenderedRowsWithinCap("active", "at-rest active");

      const activeScroll = getColumnScroll("active");
      activeScroll.scrollTop = 74 * 900;
      fireEvent.scroll(activeScroll);

      await expectRenderedRowsWithinCap("active", "after-scroll");

      await userEvent.click(
        screen.getByRole("button", { name: /Local only/i }),
      );

      activeScroll.scrollTop = 0;
      fireEvent.scroll(activeScroll);
      const inactiveScroll = getColumnScroll("inactive");
      inactiveScroll.scrollTop = 0;
      fireEvent.scroll(inactiveScroll);

      await expectRenderedRowsWithinCap(
        "inactive",
        "after-source-local inactive",
      );
      await expectRenderedRowsWithinCap("active", "after-source-local active");

      fireEvent.change(screen.getByRole("textbox", { name: /Search mods/i }), {
        target: { value: "0" },
      });

      await expectRenderedRowsWithinCap("inactive", "after-search inactive");
      await expectRenderedRowsWithinCap("active", "after-search active");

      fireEvent.change(screen.getByRole("textbox", { name: /Search mods/i }), {
        target: { value: "" },
      });
      await userEvent.click(
        screen.getByRole("button", { name: /All sources/i }),
      );

      activeScroll.scrollTop = 0;
      fireEvent.scroll(activeScroll);

      await expectRenderedRowsWithinCap(
        "inactive",
        "after-clearing-filters inactive",
      );
      await expectRenderedRowsWithinCap(
        "active",
        "after-clearing-filters active",
      );

      await userEvent.click(
        screen.getByRole("button", { name: /Move inactive mod to active/i }),
      );

      await waitFor(() => {
        within(getColumn("active")).getByText("Mod 0500");
      });

      await expectRenderedRowsWithinCap(
        "inactive",
        "after-cross-column-move inactive",
      );
      await expectRenderedRowsWithinCap(
        "active",
        "after-cross-column-move active",
      );
    } finally {
      await teardownPerfHarness(view.unmount);
    }
  });
});
