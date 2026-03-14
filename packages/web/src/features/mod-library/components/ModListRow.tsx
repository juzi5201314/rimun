import type { HomePageModListItem } from "@/features/mod-library/hooks/useHomePageController";
import type {
  DropPlacement,
  ModColumnId,
} from "@/features/mod-library/lib/mod-list-order";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  AlertTriangle,
  GripVertical,
  Lock,
  Package,
  ShieldCheck,
} from "lucide-react";
import { type ReactNode, memo, useCallback } from "react";

type DropIndicator = {
  packageId: string | null;
  placement: DropPlacement;
  targetColumn: ModColumnId;
} | null;

function SourceBadge({ source }: { source: HomePageModListItem["source"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-full px-2 text-[10px] font-medium",
        source === "installation"
          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
          : "border-sky-500/30 bg-sky-500/5 text-sky-700",
      )}
    >
      {source === "installation" ? "Local" : "Workshop"}
    </Badge>
  );
}

export const ModListRowCard = memo(function ModListRowCard({
  dragHandle,
  isDragging,
  isSelected,
  item,
  onSelect,
  showDropAfter,
  showDropBefore,
}: {
  dragHandle: ReactNode;
  isDragging: boolean;
  isSelected: boolean;
  item: HomePageModListItem;
  onSelect?: () => void;
  showDropAfter: boolean;
  showDropBefore: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-background/85 p-2 shadow-sm transition-colors",
        isSelected
          ? "border-primary/40 bg-primary/10 ring-1 ring-inset ring-primary/20"
          : "border-border/50 hover:border-primary/20 hover:bg-primary/5",
        isDragging && "opacity-25",
      )}
    >
      {showDropBefore ? (
        <div className="absolute inset-x-3 top-0 z-20 h-[3px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.04)]" />
      ) : null}
      {showDropAfter ? (
        <div className="absolute inset-x-3 bottom-0 z-20 h-[3px] translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.04)]" />
      ) : null}

      <div className="flex min-h-14 items-start gap-2">
        <div className="pt-1">{dragHandle}</div>

        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
        >
          <div className="flex items-center gap-2">
            {item.orderLabel !== null ? (
              <div className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-black text-primary">
                {item.orderLabel}
              </div>
            ) : null}

            <span
              className={cn(
                "truncate text-sm font-semibold tracking-tight",
                item.enabled ? "text-foreground" : "text-foreground/90",
              )}
              title={item.name}
            >
              {item.name}
            </span>

            <div className="flex shrink-0 items-center gap-1">
              {item.isOfficial ? (
                <div
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20"
                  title="Official mod"
                >
                  Official
                </div>
              ) : null}
              {!item.hasAboutXml ? (
                <div
                  className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-inset ring-destructive/20"
                  title="Missing About.xml"
                >
                  Invalid
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground/85">
            {item.packageId ?? item.windowsPath}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <SourceBadge source={item.source} />
            {item.version ? (
              <span className="font-mono">v{item.version}</span>
            ) : null}
            {item.dragDisabledReason ? (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                Locked
              </span>
            ) : null}
          </div>
        </button>
      </div>
    </div>
  );
});

export const ModListRow = memo(function ModListRow({
  activeDragPackageId,
  dropIndicator,
  isSelected,
  item,
  onSelect,
}: {
  activeDragPackageId: string | null;
  dropIndicator: DropIndicator;
  isSelected: boolean;
  item: HomePageModListItem;
  onSelect: (modId: string) => void;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef: setDraggableNodeRef,
  } = useDraggable({
    data: {
      columnId: item.columnId,
      packageId: item.packageIdNormalized,
      type: "mod-row",
    },
    disabled: !item.isDraggable || !item.packageIdNormalized,
    id: `drag:${item.packageIdNormalized ?? item.id}`,
  });
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    data: {
      columnId: item.columnId,
      packageId: item.packageIdNormalized,
      type: "mod-row-drop",
    },
    disabled: !item.isDraggable || !item.packageIdNormalized,
    id: `drop:${item.columnId}:${item.packageIdNormalized ?? item.id}`,
  });
  const setNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDraggableNodeRef(node);
      setDroppableNodeRef(node);
    },
    [setDraggableNodeRef, setDroppableNodeRef],
  );
  const isDropTarget =
    dropIndicator?.targetColumn === item.columnId &&
    dropIndicator.packageId === item.packageIdNormalized;
  const showDropBefore = isDropTarget && dropIndicator.placement === "before";
  const showDropAfter = isDropTarget && dropIndicator.placement === "after";
  const dragHandle = item.isDraggable ? (
    <button
      type="button"
      aria-label={`Drag ${item.name}`}
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/90 text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
      {...attributes}
      {...listeners}
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  ) : (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-muted-foreground/55"
      title={item.dragDisabledReason ?? "This mod cannot be dragged."}
    >
      {item.isOfficial ? (
        <ShieldCheck className="h-4 w-4" />
      ) : item.packageIdNormalized ? (
        <Lock className="h-4 w-4" />
      ) : (
        <Package className="h-4 w-4" />
      )}
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      data-testid="mod-library-row"
      data-column-id={item.columnId}
      data-mod-id={item.id}
      data-package-id={item.packageIdNormalized ?? undefined}
    >
      <ModListRowCard
        dragHandle={dragHandle}
        isDragging={
          isDragging ||
          (activeDragPackageId !== null &&
            activeDragPackageId === item.packageIdNormalized)
        }
        isSelected={isSelected}
        item={item}
        onSelect={() => onSelect(item.id)}
        showDropAfter={showDropAfter}
        showDropBefore={showDropBefore}
      />
    </div>
  );
});
