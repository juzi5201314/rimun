import type {
  ModLibraryResult,
  ModOrderAnalysisResult,
  ModOrderDependencyIssue,
  ModOrderDiagnostic,
  ModOrderEdge,
  ModOrderEdgeKind,
  ModOrderExplanation,
  ModOrderRecommendationAction,
  ModRecord,
} from "@rimun/shared";

type ModGroup = {
  packageId: string;
  mods: ModRecord[];
  preferredMod: ModRecord | null;
};

const CORE_PACKAGE_ID = "ludeon.rimworld";

function shouldSkipOfficialAnchor(
  anchorPackageId: string,
  targetMod: ModRecord,
) {
  return (
    targetMod.dependencyMetadata.loadBefore.includes(anchorPackageId) ||
    targetMod.dependencyMetadata.forceLoadBefore.includes(anchorPackageId)
  );
}

function uniquePackageIds(packageIds: string[]) {
  return [...new Set(packageIds.map((packageId) => packageId.toLowerCase()))];
}

function createGroupMap(mods: ModRecord[]) {
  const groups = new Map<string, ModGroup>();

  for (const mod of mods) {
    const packageId = mod.dependencyMetadata.packageIdNormalized;

    if (!packageId) {
      continue;
    }

    const existingGroup = groups.get(packageId);

    if (existingGroup) {
      existingGroup.mods.push(mod);
      continue;
    }

    groups.set(packageId, {
      packageId,
      mods: [mod],
      preferredMod: mod,
    });
  }

  return groups;
}

function getDisplayName(group: ModGroup | undefined) {
  return group?.preferredMod?.name ?? null;
}

function getCurrentOrderIndex(currentActivePackageIds: string[]) {
  const indexMap = new Map<string, number>();

  currentActivePackageIds.forEach((packageId, index) => {
    indexMap.set(packageId, index);
  });

  return indexMap;
}

function getPriorityRank(
  mod: ModRecord | null,
  currentIndex: number | undefined,
) {
  if (mod?.dependencyMetadata.packageIdNormalized === CORE_PACKAGE_ID) {
    return [
      0,
      currentIndex ?? Number.MAX_SAFE_INTEGER,
      mod.name,
      mod.id,
    ] as const;
  }

  if (mod?.isOfficial) {
    return [
      1,
      currentIndex ?? Number.MAX_SAFE_INTEGER,
      mod.name,
      mod.id,
    ] as const;
  }

  return [
    2,
    currentIndex ?? Number.MAX_SAFE_INTEGER,
    mod?.name ?? "",
    mod?.dependencyMetadata.packageIdNormalized ?? "",
  ] as const;
}

function comparePackagePriority(
  leftPackageId: string,
  rightPackageId: string,
  groups: Map<string, ModGroup>,
  currentOrderIndex: Map<string, number>,
) {
  const leftRank = getPriorityRank(
    groups.get(leftPackageId)?.preferredMod ?? null,
    currentOrderIndex.get(leftPackageId),
  );
  const rightRank = getPriorityRank(
    groups.get(rightPackageId)?.preferredMod ?? null,
    currentOrderIndex.get(rightPackageId),
  );

  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] < rightRank[index]) {
      return -1;
    }

    if (leftRank[index] > rightRank[index]) {
      return 1;
    }
  }

  return leftPackageId.localeCompare(rightPackageId);
}

function upsertDependencyIssue(
  issues: Map<string, ModOrderDependencyIssue>,
  packageId: string,
  modName: string | null,
  requiredByPackageId: string,
  requiredByName: string | null,
) {
  const existing = issues.get(packageId);

  if (existing) {
    if (!existing.requiredByPackageIds.includes(requiredByPackageId)) {
      existing.requiredByPackageIds.push(requiredByPackageId);
    }

    if (requiredByName && !existing.requiredByNames.includes(requiredByName)) {
      existing.requiredByNames.push(requiredByName);
    }

    return;
  }

  issues.set(packageId, {
    packageId,
    modName,
    requiredByPackageIds: [requiredByPackageId],
    requiredByNames: requiredByName ? [requiredByName] : [],
  });
}

function createDiagnostic(
  diagnostic: ModOrderDiagnostic,
  diagnostics: ModOrderDiagnostic[],
) {
  diagnostics.push(diagnostic);
}

function createEdge(
  edges: Map<string, ModOrderEdge>,
  explanations: Map<string, Set<string>>,
  fromPackageId: string,
  toPackageId: string,
  kind: ModOrderEdgeKind,
  reason: string,
  groups: Map<string, ModGroup>,
  isHard = true,
) {
  if (fromPackageId === toPackageId) {
    return;
  }

  const key = `${fromPackageId}:${toPackageId}:${kind}`;

  if (!edges.has(key)) {
    edges.set(key, {
      fromPackageId,
      toPackageId,
      kind,
      source: kind === "official_anchor" ? "system" : "about",
      isHard,
      reason,
    });
  }

  const fromName = getDisplayName(groups.get(fromPackageId)) ?? fromPackageId;
  const toName = getDisplayName(groups.get(toPackageId)) ?? toPackageId;
  const fromReasons = explanations.get(fromPackageId) ?? new Set<string>();
  const toReasons = explanations.get(toPackageId) ?? new Set<string>();

  fromReasons.add(`Should load before ${toName}: ${reason}`);
  toReasons.add(`Should load after ${fromName}: ${reason}`);
  explanations.set(fromPackageId, fromReasons);
  explanations.set(toPackageId, toReasons);
}

function buildTopologicalOrder(
  packageIds: string[],
  edges: ModOrderEdge[],
  groups: Map<string, ModGroup>,
  currentOrderIndex: Map<string, number>,
) {
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const packageId of packageIds) {
    adjacency.set(packageId, new Set());
    indegree.set(packageId, 0);
  }

  for (const edge of edges) {
    if (
      !adjacency.has(edge.fromPackageId) ||
      !adjacency.has(edge.toPackageId)
    ) {
      continue;
    }

    const neighbors = adjacency.get(edge.fromPackageId);

    if (neighbors?.has(edge.toPackageId)) {
      continue;
    }

    neighbors?.add(edge.toPackageId);
    indegree.set(edge.toPackageId, (indegree.get(edge.toPackageId) ?? 0) + 1);
  }

  const ready = packageIds
    .filter((packageId) => (indegree.get(packageId) ?? 0) === 0)
    .sort((left, right) =>
      comparePackagePriority(left, right, groups, currentOrderIndex),
    );
  const ordered: string[] = [];
  const orderedSet = new Set<string>();

  // 稳定拓扑排序：在满足硬约束前提下尽量保持当前顺序。
  while (ready.length > 0) {
    const currentPackageId = ready.shift();

    if (!currentPackageId) {
      break;
    }

    ordered.push(currentPackageId);
    orderedSet.add(currentPackageId);

    for (const nextPackageId of adjacency.get(currentPackageId) ?? []) {
      const nextIndegree = (indegree.get(nextPackageId) ?? 0) - 1;
      indegree.set(nextPackageId, nextIndegree);

      if (nextIndegree === 0) {
        ready.push(nextPackageId);
        ready.sort((left, right) =>
          comparePackagePriority(left, right, groups, currentOrderIndex),
        );
      }
    }
  }

  return {
    ordered,
    remaining: packageIds.filter((packageId) => !orderedSet.has(packageId)),
  };
}

function countSortDifferences(
  currentActivePackageIds: string[],
  recommendedOrderPackageIds: string[],
) {
  const currentActivePackageIdSet = new Set(currentActivePackageIds);
  const filteredRecommended = recommendedOrderPackageIds.filter((packageId) =>
    currentActivePackageIdSet.has(packageId),
  );
  const maxLength = Math.max(
    currentActivePackageIds.length,
    filteredRecommended.length,
  );
  let differenceCount = 0;

  for (let index = 0; index < maxLength; index += 1) {
    if (currentActivePackageIds[index] !== filteredRecommended[index]) {
      differenceCount += 1;
    }
  }

  return differenceCount;
}

export function analyzeModOrder(
  modLibrary: ModLibraryResult,
): ModOrderAnalysisResult {
  const diagnostics: ModOrderDiagnostic[] = [];
  const edges = new Map<string, ModOrderEdge>();
  const explanations = new Map<string, Set<string>>();
  const groups = createGroupMap(modLibrary.mods);
  const currentActivePackageIds = uniquePackageIds(modLibrary.activePackageIds);
  const currentOrderIndex = getCurrentOrderIndex(currentActivePackageIds);
  const missingInstalledInactiveDependencies = new Map<
    string,
    ModOrderDependencyIssue
  >();
  const missingUnavailableDependencies = new Map<
    string,
    ModOrderDependencyIssue
  >();

  for (const [packageId, group] of groups) {
    if (group.mods.length <= 1) {
      continue;
    }

    createDiagnostic(
      {
        code: "duplicate_package_id",
        severity: "error",
        message: `Multiple installed mods share packageId ${packageId}.`,
        packageIds: [packageId],
        modIds: group.mods.map((mod) => mod.id),
        isBlocking: true,
      },
      diagnostics,
    );
  }

  const recommendedActivePackageIds = [...currentActivePackageIds];
  const recommendedActivePackageIdSet = new Set(recommendedActivePackageIds);

  for (const activePackageId of currentActivePackageIds) {
    const activeGroup = groups.get(activePackageId);

    if (!activeGroup) {
      createDiagnostic(
        {
          code: "unknown_active_mod",
          severity: "error",
          message: `Active packageId ${activePackageId} is not installed in the scanned library.`,
          packageIds: [activePackageId],
          modIds: [],
          isBlocking: true,
        },
        diagnostics,
      );
      continue;
    }

    if (activeGroup.mods.length !== 1 || !activeGroup.preferredMod) {
      continue;
    }

    const activeMod = activeGroup.preferredMod;

    for (const dependencyPackageId of activeMod.dependencyMetadata
      .dependencies) {
      if (recommendedActivePackageIdSet.has(dependencyPackageId)) {
        continue;
      }

      const dependencyGroup = groups.get(dependencyPackageId);

      if (dependencyGroup?.mods.length === 1 && dependencyGroup.preferredMod) {
        recommendedActivePackageIds.push(dependencyPackageId);
        recommendedActivePackageIdSet.add(dependencyPackageId);
        upsertDependencyIssue(
          missingInstalledInactiveDependencies,
          dependencyPackageId,
          dependencyGroup.preferredMod.name,
          activePackageId,
          activeMod.name,
        );
        createDiagnostic(
          {
            code: "missing_installed_inactive_dependency",
            severity: "warning",
            message: `${activeMod.name} requires ${dependencyGroup.preferredMod.name}, which is installed but inactive.`,
            packageIds: [activePackageId, dependencyPackageId],
            modIds: [activeMod.id, dependencyGroup.preferredMod.id],
            isBlocking: false,
          },
          diagnostics,
        );
        continue;
      }

      upsertDependencyIssue(
        missingUnavailableDependencies,
        dependencyPackageId,
        getDisplayName(dependencyGroup),
        activePackageId,
        activeMod.name,
      );
      createDiagnostic(
        {
          code: "missing_unavailable_dependency",
          severity: "error",
          message: `${activeMod.name} requires ${dependencyPackageId}, but it is not available for activation.`,
          packageIds: [activePackageId, dependencyPackageId],
          modIds: [activeMod.id],
          isBlocking: true,
        },
        diagnostics,
      );
    }
  }

  const sortablePackageIds = recommendedActivePackageIds.filter((packageId) => {
    const group = groups.get(packageId);
    return group?.mods.length === 1 && group.preferredMod !== null;
  });
  const sortablePackageIdSet = new Set(sortablePackageIds);

  for (const packageId of sortablePackageIds) {
    const group = groups.get(packageId);
    const mod = group?.preferredMod;

    if (!mod) {
      continue;
    }

    if (packageId === CORE_PACKAGE_ID) {
      for (const targetPackageId of sortablePackageIds) {
        const targetMod = groups.get(targetPackageId)?.preferredMod;

        if (targetPackageId === packageId) {
          continue;
        }

        if (targetMod && shouldSkipOfficialAnchor(packageId, targetMod)) {
          continue;
        }

        createEdge(
          edges,
          explanations,
          packageId,
          targetPackageId,
          "official_anchor",
          "Core must load before every other mod.",
          groups,
        );
      }
    } else if (mod.isOfficial) {
      for (const targetPackageId of sortablePackageIds) {
        const targetMod = groups.get(targetPackageId)?.preferredMod;

        if (
          !targetMod ||
          targetPackageId === packageId ||
          targetMod.isOfficial ||
          shouldSkipOfficialAnchor(packageId, targetMod)
        ) {
          continue;
        }

        createEdge(
          edges,
          explanations,
          packageId,
          targetPackageId,
          "official_anchor",
          "Official content should load before community mods.",
          groups,
        );
      }
    }

    for (const dependencyPackageId of mod.dependencyMetadata.dependencies) {
      if (!sortablePackageIdSet.has(dependencyPackageId)) {
        continue;
      }

      createEdge(
        edges,
        explanations,
        dependencyPackageId,
        packageId,
        "dependency",
        `${mod.name} depends on ${getDisplayName(groups.get(dependencyPackageId)) ?? dependencyPackageId}.`,
        groups,
      );
    }

    for (const dependencyPackageId of mod.dependencyMetadata.loadAfter) {
      if (!sortablePackageIdSet.has(dependencyPackageId)) {
        continue;
      }

      createEdge(
        edges,
        explanations,
        dependencyPackageId,
        packageId,
        "load_after",
        `${mod.name} declares loadAfter ${getDisplayName(groups.get(dependencyPackageId)) ?? dependencyPackageId}.`,
        groups,
        false,
      );
    }

    for (const dependencyPackageId of mod.dependencyMetadata.forceLoadAfter) {
      if (!sortablePackageIdSet.has(dependencyPackageId)) {
        continue;
      }

      createEdge(
        edges,
        explanations,
        dependencyPackageId,
        packageId,
        "force_load_after",
        `${mod.name} declares forceLoadAfter ${getDisplayName(groups.get(dependencyPackageId)) ?? dependencyPackageId}.`,
        groups,
      );
    }

    for (const targetPackageId of mod.dependencyMetadata.loadBefore) {
      if (!sortablePackageIdSet.has(targetPackageId)) {
        continue;
      }

      createEdge(
        edges,
        explanations,
        packageId,
        targetPackageId,
        "load_before",
        `${mod.name} declares loadBefore ${getDisplayName(groups.get(targetPackageId)) ?? targetPackageId}.`,
        groups,
        false,
      );
    }

    for (const targetPackageId of mod.dependencyMetadata.forceLoadBefore) {
      if (!sortablePackageIdSet.has(targetPackageId)) {
        continue;
      }

      createEdge(
        edges,
        explanations,
        packageId,
        targetPackageId,
        "force_load_before",
        `${mod.name} declares forceLoadBefore ${getDisplayName(groups.get(targetPackageId)) ?? targetPackageId}.`,
        groups,
      );
    }

    for (const incompatiblePackageId of mod.dependencyMetadata
      .incompatibleWith) {
      if (!recommendedActivePackageIdSet.has(incompatiblePackageId)) {
        continue;
      }

      const incompatibleMod = groups.get(incompatiblePackageId)?.preferredMod;

      createDiagnostic(
        {
          code: "incompatible_mods",
          severity: "error",
          message: `${mod.name} is incompatible with ${incompatibleMod?.name ?? incompatiblePackageId}.`,
          packageIds: [packageId, incompatiblePackageId],
          modIds: [mod.id, ...(incompatibleMod ? [incompatibleMod.id] : [])],
          isBlocking: true,
        },
        diagnostics,
      );
    }
  }

  const graphEdges = [...edges.values()];
  const topologicalOrder = buildTopologicalOrder(
    sortablePackageIds,
    graphEdges,
    groups,
    currentOrderIndex,
  );

  if (topologicalOrder.remaining.length > 0) {
    createDiagnostic(
      {
        code: "cycle_detected",
        severity: "error",
        message: `A dependency cycle was detected among ${topologicalOrder.remaining.join(", ")}.`,
        packageIds: topologicalOrder.remaining,
        modIds: topologicalOrder.remaining.flatMap(
          (packageId) => groups.get(packageId)?.mods.map((mod) => mod.id) ?? [],
        ),
        isBlocking: true,
      },
      diagnostics,
    );
  }

  const recommendedOrderPackageIds =
    topologicalOrder.ordered.length === sortablePackageIds.length
      ? topologicalOrder.ordered
      : recommendedActivePackageIds;
  const sortDifferenceCount = countSortDifferences(
    currentActivePackageIds,
    recommendedOrderPackageIds,
  );
  const hasBlockingIssues = diagnostics.some(
    (diagnostic) => diagnostic.isBlocking,
  );
  const explanationList: ModOrderExplanation[] = recommendedOrderPackageIds.map(
    (packageId) => ({
      packageId,
      modName: getDisplayName(groups.get(packageId)),
      reasons: [...(explanations.get(packageId) ?? new Set())],
    }),
  );

  return {
    analyzedAt: new Date().toISOString(),
    currentActivePackageIds,
    recommendedActivePackageIds,
    recommendedOrderPackageIds,
    missingInstalledInactiveDependencies: [
      ...missingInstalledInactiveDependencies.values(),
    ],
    missingUnavailableDependencies: [
      ...missingUnavailableDependencies.values(),
    ],
    diagnostics,
    explanations: explanationList,
    edges: graphEdges,
    isOptimal:
      !hasBlockingIssues &&
      missingInstalledInactiveDependencies.size === 0 &&
      missingUnavailableDependencies.size === 0 &&
      sortDifferenceCount === 0,
    hasBlockingIssues,
    sortDifferenceCount,
  };
}

export function resolveRecommendedActivePackageIds(
  analysis: ModOrderAnalysisResult,
  actions: ModOrderRecommendationAction[],
) {
  let nextActivePackageIds = [...analysis.currentActivePackageIds];

  if (actions.includes("enableMissingDependencies")) {
    nextActivePackageIds = analysis.recommendedActivePackageIds;
  }

  if (actions.includes("reorderActiveMods")) {
    if (analysis.hasBlockingIssues) {
      throw new Error("Cannot reorder mods while blocking issues remain.");
    }

    const targetActivePackageIds = actions.includes("enableMissingDependencies")
      ? analysis.recommendedActivePackageIds
      : nextActivePackageIds;
    const orderedPackageIds = analysis.recommendedOrderPackageIds.filter(
      (packageId) => targetActivePackageIds.includes(packageId),
    );
    const leftovers = targetActivePackageIds.filter(
      (packageId) => !orderedPackageIds.includes(packageId),
    );
    nextActivePackageIds = [...orderedPackageIds, ...leftovers];
  }

  return nextActivePackageIds;
}
