import { ModListRow } from "@/features/mod-library/components/ModListRow";
import type { HomePageModListItem } from "@/features/mod-library/hooks/useHomePageController";
import type {
  DropPlacement,
  ModColumnId,
} from "@/features/mod-library/lib/mod-list-order";
import { useI18n } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Inbox, Search } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  memo,
  useCallback,
  useRef,
} from "react";

export type ColumnDropIndicator = {
  packageId: string | null;
  placement: DropPlacement;
  targetColumn: ModColumnId;
} | null;

export type ModLibraryColumnProps = {
  activeDragPackageId: string | null;
  columnId: ModColumnId;
  description: string;
  dropIndicator: ColumnDropIndicator;
  items: HomePageModListItem[];
  localizationStatusState: "loading" | "ready" | "unavailable";
  selectedModId: string | null;
  title: string;
  totalCount: number;
  onSelectMod: (modId: string) => void;
};

function getColumnDropIndicatorKey(dropIndicator: ColumnDropIndicator) {
  if (!dropIndicator) {
    return null;
  }

  return `${dropIndicator.packageId ?? "end"}:${dropIndicator.placement}`;
}

export function areModLibraryColumnPropsEqual(
  previous: ModLibraryColumnProps,
  next: ModLibraryColumnProps,
) {
  return (
    previous.activeDragPackageId === next.activeDragPackageId &&
    previous.columnId === next.columnId &&
    previous.description === next.description &&
    getColumnDropIndicatorKey(previous.dropIndicator) ===
      getColumnDropIndicatorKey(next.dropIndicator) &&
    previous.items === next.items &&
    previous.localizationStatusState === next.localizationStatusState &&
    previous.selectedModId === next.selectedModId &&
    previous.title === next.title &&
    previous.totalCount === next.totalCount &&
    previous.onSelectMod === next.onSelectMod
  );
}

function ColumnScrollArea({
  children,
  columnId,
  scrollElementRef,
}: {
  children: ReactNode;
  columnId: ModColumnId;
  scrollElementRef: RefObject<HTMLDivElement | null>;
}) {
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    data: {
      columnId,
      type: "mod-column",
    },
    id: `column:${columnId}`,
  });
  const setScrollNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollElementRef.current = node;
      setDroppableNodeRef(node);
    },
    [scrollElementRef, setDroppableNodeRef],
  );

  return (
    <div
      ref={setScrollNodeRef}
      data-testid="mod-library-column-scroll"
      data-column-id={columnId}
      className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3"
    >
      {children}
    </div>
  );
}

export const ModLibraryColumn = memo(function ModLibraryColumn({
  activeDragPackageId,
  columnId,
  description,
  dropIndicator,
  items,
  localizationStatusState,
  selectedModId,
  title,
  totalCount,
  onSelectMod,
}: ModLibraryColumnProps) {
  const { t } = useI18n();
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => 86,
    getScrollElement: () => scrollElementRef.current,
    initialRect: {
      height: 720,
      width: 0,
    },
    getItemKey: (index) => items[index]?.id ?? index,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 86,
    overscan: 8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const showColumnEndDrop =
    dropIndicator?.targetColumn === columnId &&
    dropIndicator.packageId === null;

  return (
    <section
      data-testid="mod-library-column"
      data-column-id={columnId}
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[1.75rem] border border-border/60 bg-background/70 shadow-sm"
    >
      <header className="shrink-0 border-b border-border/50 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-muted-foreground">
              {title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="rounded-full border border-border/60 bg-background/85 px-3 py-1 text-[11px] font-semibold text-foreground">
            {items.length}
            <span className="mx-1 text-muted-foreground">/</span>
            {totalCount}
          </div>
        </div>
      </header>

      <ColumnScrollArea columnId={columnId} scrollElementRef={scrollElementRef}>
        {items.length ? (
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {virtualRows.map((virtualRow) => {
              const item = items[virtualRow.index];

              return (
                <div
                  key={item.id}
                  className="absolute inset-x-0 px-1"
                  style={{
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ModListRow
                    activeDragPackageId={activeDragPackageId}
                    dropIndicator={dropIndicator}
                    isSelected={selectedModId === item.id}
                    item={item}
                    localizationStatusState={localizationStatusState}
                    measureElement={rowVirtualizer.measureElement}
                    virtualIndex={virtualRow.index}
                    onSelect={onSelectMod}
                  />
                </div>
              );
            })}

            {showColumnEndDrop ? (
              <div
                className={cn(
                  "absolute inset-x-4 h-[3px] rounded-full bg-primary",
                  items.length ? "" : "top-8",
                )}
                style={{
                  top: items.length
                    ? `${rowVirtualizer.getTotalSize()}px`
                    : "32px",
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center">
            <div className="max-w-[18rem] space-y-3 rounded-2xl border border-dashed border-border/60 bg-background/60 px-6 py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
                {totalCount ? (
                  <Search className="h-5 w-5" />
                ) : (
                  <Inbox className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {totalCount
                    ? t("mod_library_column.empty_visible_title")
                    : t("mod_library_column.empty_column_title")}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {totalCount
                    ? t("mod_library_column.empty_visible_description")
                    : t("mod_library_column.empty_column_description")}
                </p>
              </div>
            </div>
          </div>
        )}
      </ColumnScrollArea>
    </section>
  );
}, areModLibraryColumnPropsEqual);
