import {
  type ColumnDropIndicator,
  type ModLibraryColumnProps,
  areModLibraryColumnPropsEqual,
} from "@/features/mod-library/components/ModLibraryColumn";
import {
  type ActiveDragState,
  getColumnScopedDragState,
} from "@/features/mod-library/components/ModLibraryDragSurface";
import {
  type DropIndicator,
  type ModListRowProps,
  areModListRowPropsEqual,
} from "@/features/mod-library/components/ModListRow";
import type { HomePageModListItem } from "@/features/mod-library/hooks/useHomePageController";
import type { ModColumnId } from "@/features/mod-library/lib/mod-list-order";
import { describe, expect, it, vi } from "vitest";

function createItem(
  packageId: string,
  columnId: ModColumnId,
): HomePageModListItem {
  return {
    author: "Rimun",
    columnId,
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
    enabled: columnId === "active",
    hasAboutXml: true,
    id: `mod-${packageId}`,
    isDraggable: true,
    isOfficial: false,
    manifestPath: `C:\\RimWorld\\Mods\\${packageId}\\About\\About.xml`,
    name: packageId,
    notes: [],
    orderLabel: columnId === "active" ? 1 : null,
    packageId,
    packageIdNormalized: packageId,
    searchText: packageId.toLowerCase(),
    source: "installation",
    version: "1.5",
    windowsPath: `C:\\RimWorld\\Mods\\${packageId}`,
    wslPath: `/mnt/c/RimWorld/Mods/${packageId}`,
  };
}

function createColumnProps(
  columnId: ModColumnId,
  items: HomePageModListItem[],
  activeDrag: ActiveDragState,
  dropIndicator: ColumnDropIndicator,
): ModLibraryColumnProps {
  return {
    ...getColumnScopedDragState(columnId, activeDrag, dropIndicator),
    columnId,
    description: `${columnId} mods`,
    items,
    selectedModId: null,
    title: `${columnId} title`,
    totalCount: items.length,
    onSelectMod: vi.fn(),
  };
}

function createRowProps(
  item: HomePageModListItem,
  dropIndicator: DropIndicator,
  activeDragPackageId: string | null,
): ModListRowProps {
  return {
    activeDragPackageId,
    dropIndicator,
    isSelected: false,
    item,
    onSelect: vi.fn(),
  };
}

describe("mod library render scoping", () => {
  it("scopes drag state to the source and target columns", () => {
    const activeDrag: ActiveDragState = {
      packageId: "rimun.active.dragged",
      sourceColumn: "active",
    };
    const dropIndicator: ColumnDropIndicator = {
      packageId: "rimun.active.target",
      placement: "before",
      targetColumn: "active",
    };

    expect(
      getColumnScopedDragState("inactive", activeDrag, dropIndicator),
    ).toEqual({
      activeDragPackageId: null,
      dropIndicator: null,
    });
    expect(
      getColumnScopedDragState("active", activeDrag, dropIndicator),
    ).toEqual(
      expect.objectContaining({
        activeDragPackageId: "rimun.active.dragged",
        dropIndicator,
      }),
    );
  });

  it("keeps non-target column props memo-equal for other-column drag updates", () => {
    const inactiveItems = [createItem("rimun.inactive.one", "inactive")];
    const activeItems = [createItem("rimun.active.one", "active")];
    const previousActiveDrag: ActiveDragState = {
      packageId: "rimun.active.dragged",
      sourceColumn: "active",
    };
    const previousIndicator: ColumnDropIndicator = {
      packageId: "rimun.active.one",
      placement: "before",
      targetColumn: "active",
    };
    const nextIndicator: ColumnDropIndicator = {
      packageId: "rimun.active.two",
      placement: "after",
      targetColumn: "active",
    };
    const onSelectMod = vi.fn();
    const previousInactive = {
      ...createColumnProps(
        "inactive",
        inactiveItems,
        previousActiveDrag,
        previousIndicator,
      ),
      onSelectMod,
    };
    const nextInactive = {
      ...createColumnProps(
        "inactive",
        inactiveItems,
        previousActiveDrag,
        nextIndicator,
      ),
      onSelectMod,
    };
    const previousActive = {
      ...createColumnProps(
        "active",
        activeItems,
        previousActiveDrag,
        previousIndicator,
      ),
      onSelectMod,
    };
    const nextActive = {
      ...createColumnProps(
        "active",
        activeItems,
        previousActiveDrag,
        nextIndicator,
      ),
      onSelectMod,
    };

    expect(areModLibraryColumnPropsEqual(previousInactive, nextInactive)).toBe(
      true,
    );
    expect(areModLibraryColumnPropsEqual(previousActive, nextActive)).toBe(
      false,
    );
  });

  it("keeps unrelated rows memo-equal when the drop indicator moves elsewhere", () => {
    const item = createItem("rimun.row.unaffected", "active");
    const onSelect = vi.fn();
    const previousProps = {
      ...createRowProps(
        item,
        {
          packageId: "rimun.row.one",
          placement: "before",
          targetColumn: "active",
        },
        null,
      ),
      onSelect,
    };
    const nextProps = {
      ...createRowProps(
        item,
        {
          packageId: "rimun.row.two",
          placement: "after",
          targetColumn: "active",
        },
        null,
      ),
      onSelect,
    };

    expect(areModListRowPropsEqual(previousProps, nextProps)).toBe(true);
  });

  it("rerenders the previously targeted and newly targeted rows when the indicator changes", () => {
    const firstItem = createItem("rimun.row.one", "active");
    const secondItem = createItem("rimun.row.two", "active");
    const previousIndicator: DropIndicator = {
      packageId: "rimun.row.one",
      placement: "before",
      targetColumn: "active",
    };
    const nextIndicator: DropIndicator = {
      packageId: "rimun.row.two",
      placement: "before",
      targetColumn: "active",
    };
    const onSelect = vi.fn();

    expect(
      areModListRowPropsEqual(
        { ...createRowProps(firstItem, previousIndicator, null), onSelect },
        { ...createRowProps(firstItem, nextIndicator, null), onSelect },
      ),
    ).toBe(false);
    expect(
      areModListRowPropsEqual(
        { ...createRowProps(secondItem, previousIndicator, null), onSelect },
        { ...createRowProps(secondItem, nextIndicator, null), onSelect },
      ),
    ).toBe(false);
  });

  it("rerenders only the dragged row when active drag state changes", () => {
    const draggedItem = createItem("rimun.dragged", "inactive");
    const otherItem = createItem("rimun.other", "inactive");
    const onSelect = vi.fn();

    expect(
      areModListRowPropsEqual(
        { ...createRowProps(draggedItem, null, null), onSelect },
        {
          ...createRowProps(draggedItem, null, draggedItem.packageIdNormalized),
          onSelect,
        },
      ),
    ).toBe(false);
    expect(
      areModListRowPropsEqual(
        { ...createRowProps(otherItem, null, null), onSelect },
        {
          ...createRowProps(otherItem, null, draggedItem.packageIdNormalized),
          onSelect,
        },
      ),
    ).toBe(true);
  });
});
