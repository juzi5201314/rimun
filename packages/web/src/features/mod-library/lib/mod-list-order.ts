export type ModColumnId = "inactive" | "active";

export type DropPlacement = "before" | "after" | "end";

export type DraftModOrder = {
  activePackageIds: string[];
  inactivePackageIds: string[];
};

type ModWithPackageId = {
  dependencyMetadata: {
    packageIdNormalized: string | null;
  };
};

type PackageIdInputs = {
  activePackageIds: string[];
  duplicatePackageIds: ReadonlySet<string>;
  mods: ModWithPackageId[];
};

function getSortableInactivePackageIds({
  activePackageIds,
  duplicatePackageIds,
  mods,
}: PackageIdInputs) {
  const activePackageIdSet = new Set(activePackageIds);
  const sortableInactivePackageIds: string[] = [];

  for (const mod of mods) {
    const packageId = mod.dependencyMetadata.packageIdNormalized;

    if (!packageId || duplicatePackageIds.has(packageId)) {
      continue;
    }

    if (activePackageIdSet.has(packageId)) {
      continue;
    }

    sortableInactivePackageIds.push(packageId);
  }

  return sortableInactivePackageIds;
}

function insertPackageId(
  packageIds: string[],
  packageId: string,
  targetPackageId: string | null,
  placement: DropPlacement,
) {
  const nextPackageIds = packageIds.filter((current) => current !== packageId);

  if (placement === "end" || !targetPackageId) {
    return [...nextPackageIds, packageId];
  }

  const targetIndex = nextPackageIds.indexOf(targetPackageId);

  if (targetIndex < 0) {
    return [...nextPackageIds, packageId];
  }

  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  nextPackageIds.splice(insertIndex, 0, packageId);

  return nextPackageIds;
}

export function buildDefaultInactivePackageIds(inputs: PackageIdInputs) {
  return getSortableInactivePackageIds(inputs);
}

export function reconcileInactivePackageIds(
  currentInactivePackageIds: string[],
  inputs: PackageIdInputs,
) {
  const defaultInactivePackageIds = getSortableInactivePackageIds(inputs);
  const validPackageIdSet = new Set(defaultInactivePackageIds);
  const retainedPackageIds = currentInactivePackageIds.filter((packageId) =>
    validPackageIdSet.has(packageId),
  );
  const retainedPackageIdSet = new Set(retainedPackageIds);

  for (const packageId of defaultInactivePackageIds) {
    if (!retainedPackageIdSet.has(packageId)) {
      retainedPackageIds.push(packageId);
    }
  }

  return retainedPackageIds;
}

export function applyDropToDraftModOrder(
  currentOrder: DraftModOrder,
  input: {
    packageId: string;
    placement: DropPlacement;
    sourceColumn: ModColumnId;
    targetColumn: ModColumnId;
    targetPackageId: string | null;
  },
): DraftModOrder {
  if (input.targetPackageId === input.packageId) {
    return currentOrder;
  }

  const activePackageIds = currentOrder.activePackageIds.filter(
    (current) => current !== input.packageId,
  );
  const inactivePackageIds = currentOrder.inactivePackageIds.filter(
    (current) => current !== input.packageId,
  );

  if (input.targetColumn === "active") {
    return {
      activePackageIds: insertPackageId(
        activePackageIds,
        input.packageId,
        input.targetPackageId,
        input.placement,
      ),
      inactivePackageIds,
    };
  }

  return {
    activePackageIds,
    inactivePackageIds: insertPackageId(
      inactivePackageIds,
      input.packageId,
      input.targetPackageId,
      input.placement,
    ),
  };
}
