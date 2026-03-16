import type { HomePageModListItem } from "@/features/mod-library/hooks/useHomePageController";
import type {
  DropPlacement,
  ModColumnId,
} from "@/features/mod-library/lib/mod-list-order";
import { Badge } from "@/shared/components/ui/badge";
import { useI18n } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  AlertTriangle,
  GripVertical,
  Lock,
  Package,
  ShieldCheck,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  memo,
  useCallback,
  useEffect,
  useRef,
} from "react";

export type DropIndicator = {
  packageId: string | null;
  placement: DropPlacement;
  targetColumn: ModColumnId;
} | null;

export type ModListRowProps = {
  activeDragPackageId: string | null;
  dropIndicator: DropIndicator;
  isSelected: boolean;
  item: HomePageModListItem;
  localizationStatusState: "loading" | "ready" | "unavailable";
  measureElement?: (element: HTMLDivElement | null) => void;
  onSelect: (modId: string) => void;
  virtualIndex?: number;
};

function getRowDropPlacement(
  dropIndicator: DropIndicator,
  item: HomePageModListItem,
) {
  if (
    dropIndicator?.targetColumn === item.columnId &&
    dropIndicator.packageId === item.packageIdNormalized
  ) {
    return dropIndicator.placement;
  }

  return null;
}

function isRowDragged(
  activeDragPackageId: string | null,
  item: HomePageModListItem,
) {
  return (
    activeDragPackageId !== null &&
    activeDragPackageId === item.packageIdNormalized
  );
}

export function areModListRowPropsEqual(
  previous: ModListRowProps,
  next: ModListRowProps,
) {
  return (
    previous.item === next.item &&
    previous.isSelected === next.isSelected &&
    previous.localizationStatusState === next.localizationStatusState &&
    previous.onSelect === next.onSelect &&
    previous.virtualIndex === next.virtualIndex &&
    getRowDropPlacement(previous.dropIndicator, previous.item) ===
      getRowDropPlacement(next.dropIndicator, next.item) &&
    isRowDragged(previous.activeDragPackageId, previous.item) ===
      isRowDragged(next.activeDragPackageId, next.item)
  );
}

function ModListRowDroppableRegistration({
  item,
  rowElementRef,
}: {
  item: HomePageModListItem;
  rowElementRef: RefObject<HTMLDivElement | null>;
}) {
  const { setNodeRef } = useDroppable({
    data: {
      columnId: item.columnId,
      packageId: item.packageIdNormalized,
      type: "mod-row-drop",
    },
    disabled: !item.isDraggable || !item.packageIdNormalized,
    id: `drop:${item.columnId}:${item.packageIdNormalized ?? item.id}`,
  });

  useEffect(() => {
    setNodeRef(rowElementRef.current);

    return () => {
      setNodeRef(null);
    };
  }, [rowElementRef, setNodeRef]);

  return null;
}

function ModListRowDragHandle({
  item,
  rowElementRef,
}: {
  item: HomePageModListItem;
  rowElementRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef } = useDraggable({
    data: {
      columnId: item.columnId,
      packageId: item.packageIdNormalized,
      type: "mod-row",
    },
    disabled: !item.isDraggable || !item.packageIdNormalized,
    id: `drag:${item.packageIdNormalized ?? item.id}`,
  });

  useEffect(() => {
    setNodeRef(rowElementRef.current);

    return () => {
      setNodeRef(null);
    };
  }, [rowElementRef, setNodeRef]);

  if (!item.isDraggable) {
    return (
      <div
        className="flex size-8 items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-muted-foreground/55"
        title={item.dragDisabledReason ?? t("mod_list_row.cannot_drag")}
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
  }

  return (
    <button
      type="button"
      aria-label={t("mod_list_row.drag_aria", { name: item.name })}
      className="flex size-8 items-center justify-center rounded-xl border border-border/60 bg-background/90 text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
      {...attributes}
      {...listeners}
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

function SourceBadge({ source }: { source: HomePageModListItem["source"] }) {
  const { t } = useI18n();

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
      {source === "installation"
        ? t("mod_list_row.source_local")
        : t("mod_list_row.source_workshop")}
    </Badge>
  );
}

function buildMetaSummary(item: HomePageModListItem) {
  const parts = [];

  if (item.version) {
    parts.push(`v${item.version}`);
  }

  if (item.dependencyMetadata.supportedVersions.length > 0) {
    parts.push(`RW ${item.dependencyMetadata.supportedVersions.join(", ")}`);
  }

  return parts.join(" · ");
}

function getLocalizationBadge(
  item: HomePageModListItem,
  localizationStatusState: "loading" | "ready" | "unavailable",
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (localizationStatusState === "loading") {
    return {
      className:
        "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300",
      label: t("mod_list_row.translation_loading_badge"),
      title: t("mod_list_row.translation_loading_title"),
    };
  }

  if (localizationStatusState === "unavailable") {
    return {
      className:
        "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300",
      label: t("mod_list_row.translation_unavailable_badge"),
      title: t("mod_list_row.translation_unavailable_title"),
    };
  }

  const status = item.localizationStatus;

  if (status.kind === "translated") {
    if (
      status.coverage.completeness === "partial" &&
      status.coverage.percent !== null
    ) {
      return {
        className:
          "bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300",
        label: t("mod_list_row.translation_partial_badge", {
          percent: String(status.coverage.percent),
        }),
        title: t("mod_list_row.translation_partial_title"),
      };
    }

    return {
      className:
        "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
      label:
        status.coverage.completeness === "complete"
          ? t("mod_list_row.translation_complete_badge")
          : t("mod_list_row.translation_available_badge"),
      title:
        status.coverage.completeness === "complete"
          ? t("mod_list_row.translation_complete_title")
          : t("mod_list_row.translation_available_title"),
    };
  }

  if (status.kind === "unknown") {
    return {
      className:
        "bg-slate-500/10 text-slate-700 ring-slate-500/25 dark:text-slate-300",
      label: t("mod_list_row.translation_unknown_badge"),
      title: t("mod_list_row.translation_unknown_title"),
    };
  }

  if (status.kind === "missing_language") {
    return {
      className:
        "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300",
      label: t("mod_list_row.translation_missing_language_badge"),
      title: t("mod_list_row.translation_missing_language_title"),
    };
  }

  return {
    className:
      "bg-zinc-500/10 text-zinc-700 ring-zinc-500/25 dark:text-zinc-300",
    label: t("mod_list_row.no_translation_badge"),
    title: t("mod_list_row.no_translation_title"),
  };
}

export const ModListRowCard = memo(function ModListRowCard({
  dragHandle,
  isDragging,
  isSelected,
  item,
  localizationStatusState,
  onSelect,
  showDropAfter,
  showDropBefore,
}: {
  dragHandle: ReactNode;
  isDragging: boolean;
  isSelected: boolean;
  item: HomePageModListItem;
  localizationStatusState: "loading" | "ready" | "unavailable";
  onSelect?: () => void;
  showDropAfter: boolean;
  showDropBefore: boolean;
}) {
  const { t } = useI18n();
  const metaSummary = buildMetaSummary(item);
  const localizationBadge = getLocalizationBadge(
    item,
    localizationStatusState,
    t,
  );

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-background/85 px-2.5 py-2 shadow-sm transition-colors",
        item.hasCurrentOrderIssue
          ? "border-destructive/20 bg-destructive/[0.04]"
          : "border-border/50",
        isSelected
          ? item.hasCurrentOrderIssue
            ? "border-destructive/35 bg-destructive/[0.08] ring-1 ring-inset ring-destructive/20"
            : "border-primary/40 bg-primary/10 ring-1 ring-inset ring-primary/20"
          : item.hasCurrentOrderIssue
            ? "hover:border-destructive/30 hover:bg-destructive/[0.06]"
            : "hover:border-primary/20 hover:bg-primary/5",
        isDragging && "opacity-25",
      )}
      data-order-issue={item.hasCurrentOrderIssue ? "true" : undefined}
    >
      {showDropBefore ? (
        <div className="absolute inset-x-3 top-0 z-20 h-[3px] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.04)]" />
      ) : null}
      {showDropAfter ? (
        <div className="absolute inset-x-3 bottom-0 z-20 h-[3px] translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.04)]" />
      ) : null}

      <div className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)] gap-x-3">
        <div className="flex items-center">{dragHandle}</div>

        <button
          type="button"
          className="flex min-w-0 flex-col justify-center gap-1 text-left"
          onClick={onSelect}
        >
          <div className="flex min-w-0 items-center gap-2">
            {item.orderLabel !== null ? (
              <div className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-black text-primary">
                {item.orderLabel}
              </div>
            ) : null}

            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm font-semibold tracking-tight",
                item.enabled ? "text-foreground" : "text-foreground/90",
              )}
              title={item.name}
            >
              {item.name}
            </span>

            <div className="flex shrink-0 items-center gap-1">
              {item.hasUnsupportedGameVersion ? (
                <div
                  className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/25"
                  title={t("mod_list_row.unsupported_game_version_title", {
                    version:
                      item.currentGameVersion ?? t("common.not_available"),
                  })}
                >
                  {t("mod_list_row.unsupported_game_version_badge")}
                </div>
              ) : null}
              {item.isOfficial ? (
                <div
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20"
                  title={t("mod_list_row.official_mod_title")}
                >
                  {t("mod_list_row.official_badge")}
                </div>
              ) : null}
              {!item.hasAboutXml ? (
                <div
                  className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-inset ring-destructive/20"
                  title={t("mod_list_row.missing_about_title")}
                >
                  {t("mod_list_row.invalid_badge")}
                </div>
              ) : null}
              <div
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                  localizationBadge.className,
                )}
                title={localizationBadge.title}
              >
                {localizationBadge.label}
              </div>
            </div>
          </div>

          <div className="truncate font-mono text-[11px] text-muted-foreground/85">
            {item.packageId ?? item.windowsPath}
          </div>

          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-[11px] text-muted-foreground">
            <SourceBadge source={item.source} />
            {metaSummary ? (
              <span className="truncate font-mono">{metaSummary}</span>
            ) : null}
            {item.dragDisabledReason ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                {t("mod_list_row.locked_badge")}
              </span>
            ) : null}
            {item.hasUnsupportedGameVersion ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                {t("mod_list_row.unsupported_game_version_inline")}
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
  localizationStatusState,
  measureElement,
  onSelect,
  virtualIndex,
}: ModListRowProps) {
  const rowElementRef = useRef<HTMLDivElement | null>(null);
  const setRowElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowElementRef.current = node;
      measureElement?.(node);
    },
    [measureElement],
  );
  const dropPlacement = getRowDropPlacement(dropIndicator, item);
  const showDropBefore = dropPlacement === "before";
  const showDropAfter = dropPlacement === "after";
  const isActiveDragRow = isRowDragged(activeDragPackageId, item);

  return (
    <div
      ref={setRowElementRef}
      className="py-0.5"
      data-testid="mod-library-row"
      data-index={virtualIndex}
      data-column-id={item.columnId}
      data-mod-id={item.id}
      data-order-issue={item.hasCurrentOrderIssue ? "true" : undefined}
      data-package-id={item.packageIdNormalized ?? undefined}
    >
      <ModListRowDroppableRegistration
        item={item}
        rowElementRef={rowElementRef}
      />
      <ModListRowCard
        dragHandle={
          <ModListRowDragHandle item={item} rowElementRef={rowElementRef} />
        }
        isDragging={isActiveDragRow}
        isSelected={isSelected}
        item={item}
        localizationStatusState={localizationStatusState}
        onSelect={() => onSelect(item.id)}
        showDropAfter={showDropAfter}
        showDropBefore={showDropBefore}
      />
    </div>
  );
}, areModListRowPropsEqual);
