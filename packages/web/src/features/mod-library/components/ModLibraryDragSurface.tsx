import {
  type ColumnDropIndicator,
  ModLibraryColumn,
} from "@/features/mod-library/components/ModLibraryColumn";
import { ModListRowCard } from "@/features/mod-library/components/ModListRow";
import type {
  HomePageController,
  HomePageModListItem,
} from "@/features/mod-library/hooks/useHomePageController";
import type {
  DropPlacement,
  ModColumnId,
} from "@/features/mod-library/lib/mod-list-order";
import { useI18n } from "@/shared/i18n";
import {
  DndContext,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useMemo, useState } from "react";

export type ActiveDragState = {
  packageId: string;
  sourceColumn: ModColumnId;
} | null;

function areDropIndicatorsEqual(
  left: ColumnDropIndicator,
  right: ColumnDropIndicator,
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.packageId === right.packageId &&
    left.placement === right.placement &&
    left.targetColumn === right.targetColumn
  );
}

function resolveDropIndicator(event: DragOverEvent): ColumnDropIndicator {
  const over = event.over;
  const overData = over?.data.current;

  if (!overData) {
    return null;
  }

  if (overData["type"] === "mod-column") {
    return {
      packageId: null,
      placement: "end",
      targetColumn: overData["columnId"] as ModColumnId,
    };
  }

  if (overData["type"] !== "mod-row-drop" || !over) {
    return null;
  }

  const translatedRect = event.active.rect.current.translated;
  const activeMidY = translatedRect
    ? translatedRect.top + translatedRect.height / 2
    : over.rect.top;
  const overMidY = over.rect.top + over.rect.height / 2;
  const placement: DropPlacement = activeMidY >= overMidY ? "after" : "before";

  return {
    packageId: overData["packageId"] as string | null,
    placement,
    targetColumn: overData["columnId"] as ModColumnId,
  };
}

export function getColumnScopedDragState(
  columnId: ModColumnId,
  activeDrag: ActiveDragState,
  dropIndicator: ColumnDropIndicator,
) {
  return {
    activeDragPackageId:
      activeDrag?.sourceColumn === columnId ? activeDrag.packageId : null,
    dropIndicator:
      dropIndicator?.targetColumn === columnId ? dropIndicator : null,
  };
}

export function ModLibraryDragSurface({
  controller,
}: {
  controller: HomePageController;
}) {
  const { t } = useI18n();
  const [activeDrag, setActiveDrag] = useState<ActiveDragState>(null);
  const [dropIndicator, setDropIndicator] = useState<ColumnDropIndicator>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const draggableItemsByPackageId = useMemo(() => {
    const nextMap = new Map<string, HomePageModListItem>();

    for (const mod of [...controller.activeMods, ...controller.inactiveMods]) {
      if (mod.packageIdNormalized && mod.isDraggable) {
        nextMap.set(mod.packageIdNormalized, mod);
      }
    }

    return nextMap;
  }, [controller.activeMods, controller.inactiveMods]);
  const activeDragItem = activeDrag
    ? (draggableItemsByPackageId.get(activeDrag.packageId) ?? null)
    : null;
  const inactiveColumnDragState = getColumnScopedDragState(
    "inactive",
    activeDrag,
    dropIndicator,
  );
  const activeColumnDragState = getColumnScopedDragState(
    "active",
    activeDrag,
    dropIndicator,
  );
  const localizationStatusState = controller.hasResolvedLocalizationStatus
    ? "ready"
    : controller.isLocalizationStatusPending
      ? "loading"
      : "unavailable";

  function handleDragStart(event: DragStartEvent) {
    const packageId = event.active.data.current?.["packageId"];
    const sourceColumn = event.active.data.current?.["columnId"];

    if (
      typeof packageId === "string" &&
      (sourceColumn === "active" || sourceColumn === "inactive")
    ) {
      setActiveDrag({ packageId, sourceColumn });
      return;
    }

    setActiveDrag(null);
  }

  function handleDragOver(event: DragOverEvent) {
    const nextIndicator = resolveDropIndicator(event);

    setDropIndicator((current) =>
      areDropIndicatorsEqual(current, nextIndicator) ? current : nextIndicator,
    );
  }

  function resetDragState() {
    setActiveDrag(null);
    setDropIndicator(null);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragCancel={resetDragState}
      onDragEnd={(event) => {
        const packageId = event.active.data.current?.["packageId"];
        const sourceColumn = event.active.data.current?.["columnId"];

        if (
          typeof packageId === "string" &&
          (sourceColumn === "active" || sourceColumn === "inactive") &&
          dropIndicator
        ) {
          controller.handleDropMod({
            packageId,
            placement: dropIndicator.placement,
            sourceColumn,
            targetColumn: dropIndicator.targetColumn,
            targetPackageId: dropIndicator.packageId,
          });
        }

        resetDragState();
      }}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
    >
      <div className="min-h-0 flex-1 bg-background/5 p-4">
        <div className="grid h-full min-h-0 grid-cols-2 gap-4">
          <ModLibraryColumn
            activeDragPackageId={inactiveColumnDragState.activeDragPackageId}
            columnId="inactive"
            description={t("mod_library_columns.inactive_description")}
            dropIndicator={inactiveColumnDragState.dropIndicator}
            items={controller.visibleInactiveMods}
            localizationStatusState={localizationStatusState}
            selectedModId={controller.selectedMod?.id ?? null}
            title={t("mod_library_columns.inactive_title")}
            totalCount={controller.inactiveMods.length}
            onSelectMod={controller.setSelectedModId}
          />
          <ModLibraryColumn
            activeDragPackageId={activeColumnDragState.activeDragPackageId}
            columnId="active"
            description={t("mod_library_columns.active_description")}
            dropIndicator={activeColumnDragState.dropIndicator}
            items={controller.visibleActiveMods}
            localizationStatusState={localizationStatusState}
            selectedModId={controller.selectedMod?.id ?? null}
            title={t("mod_library_columns.active_title")}
            totalCount={controller.activeMods.length}
            onSelectMod={controller.setSelectedModId}
          />
        </div>
      </div>

      <DragOverlay>
        {activeDragItem ? (
          <div className="w-[30rem] max-w-[calc(50vw-4rem)] opacity-95">
            <ModListRowCard
              dragHandle={
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <GripVertical className="h-4 w-4" />
                </div>
              }
              isDragging={false}
              isSelected={false}
              item={activeDragItem}
              localizationStatusState={localizationStatusState}
              showDropAfter={false}
              showDropBefore={false}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
