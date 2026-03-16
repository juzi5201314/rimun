import {
  type DraftModOrder,
  type DropPlacement,
  type ModColumnId,
  applyDropToDraftModOrder,
  buildDefaultInactivePackageIds,
  reconcileInactivePackageIds,
} from "@/features/mod-library/lib/mod-list-order";
import { useModSourceSnapshotQuery } from "@/features/mod-source/hooks/useModSourceSnapshotQuery";
import { useDelayedBusy } from "@/shared/hooks/useDelayedBusy";
import { useHostApi } from "@/shared/host/HostApiProvider";
import { useI18n } from "@/shared/i18n";
import { queryKeys } from "@/shared/lib/queryKeys";
import {
  analyzeModOrder,
  buildModLibraryFromSnapshot,
  resolveRecommendedActivePackageIds,
} from "@rimun/domain";
import type {
  ModOrderAnalysisResult,
  ModOrderEdge,
  ModRecord,
  ProfileCatalogResult,
} from "@rimun/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
}

function sortModsByName(left: ModRecord, right: ModRecord) {
  return left.name.localeCompare(right.name);
}

function normalizeGameVersion(value: string | null) {
  if (!value) {
    return null;
  }

  const match = /(\d+\.\d+)/.exec(value);

  return match?.[1] ?? null;
}

function collectCurrentOrderViolations(
  analysis: ModOrderAnalysisResult | null,
): ModOrderEdge[] {
  if (!analysis) {
    return [];
  }

  const currentOrderIndex = new Map(
    analysis.currentActivePackageIds.map((packageId, index) => [
      packageId,
      index,
    ]),
  );

  return analysis.edges.filter((edge) => {
    const fromIndex = currentOrderIndex.get(edge.fromPackageId);
    const toIndex = currentOrderIndex.get(edge.toPackageId);

    return (
      fromIndex !== undefined && toIndex !== undefined && fromIndex >= toIndex
    );
  });
}

type PreparedModRecord = ModRecord & {
  currentGameVersion: string | null;
  dragDisabledReason: string | null;
  hasCurrentOrderIssue: boolean;
  hasUnsupportedGameVersion: boolean;
  isDraggable: boolean;
  packageIdNormalized: string | null;
  searchText: string;
};

export type HomePageModListItem = PreparedModRecord & {
  columnId: ModColumnId;
  orderLabel: number | null;
};

type FeedbackTone = "success" | "warning" | "error";

export type HomePageFeedbackState = {
  tone: FeedbackTone;
  message: string;
} | null;

function isVisibleMod(
  mod: PreparedModRecord,
  sourceFilter: "all" | "local" | "workshop",
  term: string,
) {
  if (sourceFilter === "local" && mod.source !== "installation") {
    return false;
  }

  if (sourceFilter === "workshop" && mod.source !== "workshop") {
    return false;
  }

  if (!term) {
    return true;
  }

  return mod.searchText.includes(term);
}

export function useHomePageController() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const getHostApi = useHostApi();
  const profileCatalogQuery = useQuery({
    queryKey: queryKeys.profileCatalog(),
    queryFn: async () => {
      const hostApi = await getHostApi();
      return hostApi.getProfileCatalog();
    },
  });
  const currentProfileId = profileCatalogQuery.data?.currentProfileId ?? null;
  const currentProfile =
    profileCatalogQuery.data?.profiles.find(
      (profile) => profile.id === currentProfileId,
    ) ?? null;
  const modSourceSnapshotQuery = useModSourceSnapshotQuery(currentProfileId);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedModId, setSelectedModId] = useState<string | null>(null);
  const [draftProfileName, setDraftProfileName] = useState("");
  const [draftModOrder, setDraftModOrder] = useState<DraftModOrder>({
    activePackageIds: [],
    inactivePackageIds: [],
  });
  const [feedback, setFeedback] = useState<HomePageFeedbackState>(null);
  const [isDependencyDialogOpen, setIsDependencyDialogOpen] = useState(false);
  const [isSortDialogOpen, setIsSortDialogOpen] = useState(false);
  const [isCreateProfileDialogOpen, setIsCreateProfileDialogOpen] =
    useState(false);
  const [isDeleteProfileDialogOpen, setIsDeleteProfileDialogOpen] =
    useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [dismissedDependencyAnalysisAt, setDismissedDependencyAnalysisAt] =
    useState<string | null>(null);
  const [dismissedSortAnalysisAt, setDismissedSortAnalysisAt] = useState<
    string | null
  >(null);
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "local" | "workshop"
  >("all");
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isRescanInFlight, setIsRescanInFlight] = useState(false);
  const lastHydratedProfileIdRef = useRef<string | null>(null);
  const rescanRequestRef = useRef<Promise<void> | null>(null);

  const createProfileMutation = useMutation({
    mutationFn: async (input: { name: string; sourceProfileId: string }) => {
      const hostApi = await getHostApi();
      return hostApi.createProfile(input);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.profileCatalog(), result);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.profileCatalog(),
      });
    },
  });
  const switchProfileMutation = useMutation({
    mutationFn: async (input: { profileId: string }) => {
      const hostApi = await getHostApi();
      return hostApi.switchProfile(input);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.profileCatalog(), result);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modSourceSnapshotRoot(),
      });
    },
  });
  const deleteProfileMutation = useMutation({
    mutationFn: async (input: { profileId: string }) => {
      const hostApi = await getHostApi();
      return hostApi.deleteProfile(input);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.profileCatalog(), result);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modSourceSnapshotRoot(),
      });
    },
  });
  const saveProfileMutation = useMutation({
    mutationFn: async (input: {
      profileId: string;
      name: string;
      activePackageIds: string[];
      applyToGame: boolean;
    }) => {
      const hostApi = await getHostApi();
      return hostApi.saveProfile(input);
    },
    onSuccess: async (result, variables) => {
      queryClient.setQueryData(
        queryKeys.profileCatalog(),
        (current: ProfileCatalogResult | undefined) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            profiles: current.profiles.map((profile) =>
              profile.id === result.id ? result : profile,
            ),
          };
        },
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.profileCatalog(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modSourceSnapshot(variables.profileId),
      });
    },
  });
  const applyActivePackageIdsMutation = useMutation({
    mutationFn: async (input: {
      profileId: string;
      activePackageIds: string[];
      applyToGame: boolean;
    }) => {
      const hostApi = await getHostApi();
      return hostApi.applyActivePackageIds(input);
    },
    onSuccess: async (result, variables) => {
      queryClient.setQueryData(
        queryKeys.profileCatalog(),
        (current: ProfileCatalogResult | undefined) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            profiles: current.profiles.map((profile) =>
              profile.id === result.id ? result : profile,
            ),
          };
        },
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.profileCatalog(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modSourceSnapshot(variables.profileId),
      });
    },
  });

  const modSourceSnapshot = modSourceSnapshotQuery.data;
  const modLibrary = useMemo(
    () =>
      modSourceSnapshot
        ? buildModLibraryFromSnapshot(modSourceSnapshot)
        : undefined,
    [modSourceSnapshot],
  );
  const packageIdCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const mod of modLibrary?.mods ?? []) {
      const packageId = mod.dependencyMetadata.packageIdNormalized;

      if (!packageId) {
        continue;
      }

      counts.set(packageId, (counts.get(packageId) ?? 0) + 1);
    }

    return counts;
  }, [modLibrary]);
  const duplicatePackageIds = useMemo(
    () =>
      new Set(
        [...packageIdCounts.entries()]
          .filter(([, count]) => count > 1)
          .map(([packageId]) => packageId),
      ),
    [packageIdCounts],
  );
  const draftActivePackageIds = draftModOrder.activePackageIds;
  const draftInactivePackageIds = draftModOrder.inactivePackageIds;
  const savedProfileName = currentProfile?.name ?? "";
  const savedActivePackageIds = modLibrary?.activePackageIds ?? [];
  const isDirty =
    currentProfile !== null &&
    ((draftProfileName.trim() || savedProfileName) !== savedProfileName ||
      !areStringArraysEqual(draftActivePackageIds, savedActivePackageIds));
  const analysisInput = useMemo(() => {
    if (!modLibrary || modLibrary.requiresConfiguration) {
      return null;
    }

    if (
      areStringArraysEqual(draftActivePackageIds, modLibrary.activePackageIds)
    ) {
      return modLibrary;
    }

    return {
      ...modLibrary,
      activePackageIds: draftActivePackageIds,
    };
  }, [draftActivePackageIds, modLibrary]);

  useEffect(() => {
    if (!currentProfileId) {
      return;
    }

    setSelectedModId(null);
    setFeedback(null);
    setIsDependencyDialogOpen(false);
    setIsSortDialogOpen(false);
    setDismissedDependencyAnalysisAt(null);
    setDismissedSortAnalysisAt(null);
  }, [currentProfileId]);

  useEffect(() => {
    if (!currentProfile || !modLibrary) {
      return;
    }

    const nextActivePackageIds = modLibrary.activePackageIds;
    const nextDefaultInactivePackageIds = buildDefaultInactivePackageIds({
      activePackageIds: nextActivePackageIds,
      duplicatePackageIds,
      mods: modLibrary.mods,
    });

    setDraftProfileName(currentProfile.name);
    setDraftModOrder((currentOrder) => ({
      activePackageIds: nextActivePackageIds,
      inactivePackageIds:
        lastHydratedProfileIdRef.current === currentProfile.id
          ? reconcileInactivePackageIds(currentOrder.inactivePackageIds, {
              activePackageIds: nextActivePackageIds,
              duplicatePackageIds,
              mods: modLibrary.mods,
            })
          : nextDefaultInactivePackageIds,
    }));
    lastHydratedProfileIdRef.current = currentProfile.id;
  }, [currentProfile, duplicatePackageIds, modLibrary]);

  const loadingOverlayVisible = useDelayedBusy(
    applyActivePackageIdsMutation.isPending ||
      createProfileMutation.isPending ||
      switchProfileMutation.isPending ||
      deleteProfileMutation.isPending ||
      saveProfileMutation.isPending,
    400,
  );
  const analysis = useMemo(() => {
    if (!analysisInput) {
      return null;
    }

    return analyzeModOrder(analysisInput);
  }, [analysisInput]);
  const currentOrderViolations = useMemo(
    () => collectCurrentOrderViolations(analysis),
    [analysis],
  );
  const currentOrderProblemPackageIds = useMemo(
    () =>
      new Set(
        currentOrderViolations.flatMap((edge) => [
          edge.fromPackageId,
          edge.toPackageId,
        ]),
      ),
    [currentOrderViolations],
  );
  const currentGameVersion = useMemo(
    () => normalizeGameVersion(modLibrary?.gameVersion ?? null),
    [modLibrary?.gameVersion],
  );
  const preparedMods = useMemo<PreparedModRecord[]>(() => {
    const draftActivePackageIdSet = new Set(draftActivePackageIds);

    return (modLibrary?.mods ?? []).map((mod) => {
      const packageIdNormalized = mod.dependencyMetadata.packageIdNormalized;
      const isUniquePackageId = packageIdNormalized
        ? (packageIdCounts.get(packageIdNormalized) ?? 0) === 1
        : false;
      const enabled = packageIdNormalized
        ? draftActivePackageIdSet.has(packageIdNormalized)
        : false;
      const normalizedSupportedVersions =
        mod.dependencyMetadata.supportedVersions
          .map((version) => normalizeGameVersion(version))
          .filter((version): version is string => Boolean(version));
      const hasUnsupportedGameVersion =
        enabled &&
        currentGameVersion !== null &&
        normalizedSupportedVersions.length > 0 &&
        !normalizedSupportedVersions.includes(currentGameVersion);

      return {
        ...mod,
        currentGameVersion,
        dragDisabledReason: !packageIdNormalized
          ? t("home_controller.missing_package_id")
          : !isUniquePackageId
            ? t("home_controller.duplicate_package_id")
            : null,
        enabled,
        hasCurrentOrderIssue: packageIdNormalized
          ? currentOrderProblemPackageIds.has(packageIdNormalized)
          : false,
        hasUnsupportedGameVersion,
        isDraggable: Boolean(packageIdNormalized && isUniquePackageId),
        packageIdNormalized,
        searchText: [mod.name, mod.packageId ?? "", mod.author ?? ""]
          .join("\n")
          .toLowerCase(),
      };
    });
  }, [
    currentOrderProblemPackageIds,
    draftActivePackageIds,
    modLibrary,
    currentGameVersion,
    packageIdCounts,
    t,
  ]);
  const activeIndexByPackageId = useMemo(() => {
    const nextMap = new Map<string, number>();

    for (const [index, packageId] of draftActivePackageIds.entries()) {
      nextMap.set(packageId, index);
    }

    return nextMap;
  }, [draftActivePackageIds]);
  const uniqueModByPackageId = useMemo(() => {
    const modsByPackageId = new Map<string, PreparedModRecord>();

    for (const mod of preparedMods) {
      if (mod.packageIdNormalized && mod.isDraggable) {
        modsByPackageId.set(mod.packageIdNormalized, mod);
      }
    }

    return modsByPackageId;
  }, [preparedMods]);
  const activeMods = useMemo<HomePageModListItem[]>(() => {
    const orderedActiveMods = draftActivePackageIds.flatMap((packageId) => {
      const mod = uniqueModByPackageId.get(packageId);

      if (!mod || !mod.enabled) {
        return [];
      }

      return [
        {
          ...mod,
          columnId: "active" as ModColumnId,
          orderLabel: (activeIndexByPackageId.get(packageId) ?? 0) + 1,
        },
      ];
    });
    const lockedActiveMods = preparedMods
      .filter((mod) => mod.enabled && !mod.isDraggable)
      .slice()
      .sort((left, right) => {
        const leftOrder = left.packageIdNormalized
          ? (activeIndexByPackageId.get(left.packageIdNormalized) ??
            Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;
        const rightOrder = right.packageIdNormalized
          ? (activeIndexByPackageId.get(right.packageIdNormalized) ??
            Number.MAX_SAFE_INTEGER)
          : Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return sortModsByName(left, right);
      })
      .map((mod) => ({
        ...mod,
        columnId: "active" as ModColumnId,
        orderLabel: mod.packageIdNormalized
          ? (activeIndexByPackageId.get(mod.packageIdNormalized) ?? -1) + 1
          : null,
      }));

    return [...orderedActiveMods, ...lockedActiveMods];
  }, [
    activeIndexByPackageId,
    draftActivePackageIds,
    preparedMods,
    uniqueModByPackageId,
  ]);
  const inactiveMods = useMemo<HomePageModListItem[]>(() => {
    const orderedInactiveMods = draftInactivePackageIds.flatMap((packageId) => {
      const mod = uniqueModByPackageId.get(packageId);

      if (!mod || mod.enabled) {
        return [];
      }

      return [
        {
          ...mod,
          columnId: "inactive" as ModColumnId,
          orderLabel: null,
        },
      ];
    });
    const orderedInactivePackageIdSet = new Set(
      orderedInactiveMods.flatMap((mod) =>
        mod.packageIdNormalized ? [mod.packageIdNormalized] : [],
      ),
    );
    const trailingSortableInactiveMods = preparedMods
      .filter(
        (mod) =>
          !mod.enabled &&
          mod.isDraggable &&
          mod.packageIdNormalized !== null &&
          !orderedInactivePackageIdSet.has(mod.packageIdNormalized),
      )
      .slice()
      .sort(sortModsByName)
      .map((mod) => ({
        ...mod,
        columnId: "inactive" as ModColumnId,
        orderLabel: null,
      }));
    const lockedInactiveMods = preparedMods
      .filter((mod) => !mod.enabled && !mod.isDraggable)
      .slice()
      .sort(sortModsByName)
      .map((mod) => ({
        ...mod,
        columnId: "inactive" as ModColumnId,
        orderLabel: null,
      }));

    return [
      ...orderedInactiveMods,
      ...trailingSortableInactiveMods,
      ...lockedInactiveMods,
    ];
  }, [draftInactivePackageIds, preparedMods, uniqueModByPackageId]);
  const term = deferredSearchQuery.trim().toLowerCase();
  const visibleActiveMods = useMemo(
    () => activeMods.filter((mod) => isVisibleMod(mod, sourceFilter, term)),
    [activeMods, sourceFilter, term],
  );
  const visibleInactiveMods = useMemo(
    () => inactiveMods.filter((mod) => isVisibleMod(mod, sourceFilter, term)),
    [inactiveMods, sourceFilter, term],
  );
  const filteredMods = useMemo(
    () => [...visibleInactiveMods, ...visibleActiveMods],
    [visibleActiveMods, visibleInactiveMods],
  );
  const selectedMod =
    preparedMods.find((mod) => mod.id === selectedModId) ??
    visibleActiveMods.find((mod) => mod.id === selectedModId) ??
    visibleInactiveMods.find((mod) => mod.id === selectedModId) ??
    visibleActiveMods[0] ??
    visibleInactiveMods[0] ??
    activeMods[0] ??
    inactiveMods[0] ??
    null;
  const selectedPackageId = selectedMod?.packageIdNormalized ?? null;
  const selectedExplanation =
    selectedPackageId && analysis
      ? (analysis.explanations.find(
          (explanation) => explanation.packageId === selectedPackageId,
        ) ?? null)
      : null;
  const isBusy =
    createProfileMutation.isPending ||
    switchProfileMutation.isPending ||
    deleteProfileMutation.isPending ||
    saveProfileMutation.isPending ||
    applyActivePackageIdsMutation.isPending;
  const isRescanning = isRescanInFlight || modSourceSnapshotQuery.isFetching;
  const shouldPromptEnableDependencies =
    Boolean(analysis) &&
    !applyActivePackageIdsMutation.isPending &&
    !isDirty &&
    (analysis?.missingInstalledInactiveDependencies.length ?? 0) > 0 &&
    dismissedDependencyAnalysisAt !== analysis?.analyzedAt;
  const shouldPromptApplySort =
    Boolean(analysis) &&
    !applyActivePackageIdsMutation.isPending &&
    !isDirty &&
    (analysis?.missingInstalledInactiveDependencies.length ?? 0) === 0 &&
    !analysis?.hasBlockingIssues &&
    (analysis?.sortDifferenceCount ?? 0) > 0 &&
    dismissedSortAnalysisAt !== analysis?.analyzedAt;

  useEffect(() => {
    if (
      !selectedModId ||
      !selectedMod ||
      selectedMod.id === selectedModId ||
      preparedMods.some((mod) => mod.id === selectedModId)
    ) {
      return;
    }

    setSelectedModId(selectedMod.id);
  }, [preparedMods, selectedMod, selectedModId]);

  useEffect(() => {
    setIsDependencyDialogOpen(shouldPromptEnableDependencies);
  }, [shouldPromptEnableDependencies]);

  useEffect(() => {
    setIsSortDialogOpen(shouldPromptApplySort);
  }, [shouldPromptApplySort]);

  function updateDraftModOrder(
    updater: (currentOrder: DraftModOrder) => DraftModOrder,
  ) {
    setFeedback(null);
    setDraftModOrder((currentOrder) => {
      const nextOrder = updater(currentOrder);

      if (
        areStringArraysEqual(
          currentOrder.activePackageIds,
          nextOrder.activePackageIds,
        ) &&
        areStringArraysEqual(
          currentOrder.inactivePackageIds,
          nextOrder.inactivePackageIds,
        )
      ) {
        return currentOrder;
      }

      return nextOrder;
    });
  }

  function handleDropMod(input: {
    packageId: string;
    placement: DropPlacement;
    sourceColumn: ModColumnId;
    targetColumn: ModColumnId;
    targetPackageId: string | null;
  }) {
    updateDraftModOrder((currentOrder) =>
      applyDropToDraftModOrder(currentOrder, input),
    );
  }

  async function persistDraft(options: {
    applyToGame: boolean;
    feedbackMessage: string;
  }) {
    if (!currentProfileId || !currentProfile) {
      throw new Error(t("home_controller.no_profile_selected"));
    }

    const nextName = draftProfileName.trim() || currentProfile.name;
    const result = await saveProfileMutation.mutateAsync({
      profileId: currentProfileId,
      name: nextName,
      activePackageIds: draftActivePackageIds,
      applyToGame: options.applyToGame,
    });

    setFeedback({
      tone: "success",
      message: options.feedbackMessage,
    });

    return result;
  }

  async function handleSaveProfile() {
    try {
      await persistDraft({
        applyToGame: true,
        feedbackMessage: t("home_controller.profile_saved_applied"),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("home_controller.failed_save_profile"),
      });
    }
  }

  async function handleProfileSwitch(nextProfileId: string) {
    if (!currentProfileId || nextProfileId === currentProfileId) {
      return;
    }

    try {
      if (isDirty) {
        await persistDraft({
          applyToGame: true,
          feedbackMessage: t("home_controller.saved_before_switching"),
        });
      }

      const catalog = await switchProfileMutation.mutateAsync({
        profileId: nextProfileId,
      });
      const switchedProfile =
        catalog.profiles.find((profile) => profile.id === nextProfileId) ??
        null;

      setFeedback({
        tone: "success",
        message: switchedProfile
          ? t("home_controller.switched_to", { name: switchedProfile.name })
          : t("home_controller.switched_profile"),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("home_controller.failed_switch_profile"),
      });
    }
  }

  async function handleCreateProfile() {
    if (!currentProfileId || !currentProfile) {
      return;
    }

    const name = newProfileName.trim();

    if (!name) {
      return;
    }

    try {
      if (isDirty) {
        await persistDraft({
          applyToGame: true,
          feedbackMessage: t("home_controller.saved_before_creating"),
        });
      }

      const catalog = await createProfileMutation.mutateAsync({
        name,
        sourceProfileId: currentProfileId,
      });
      const createdProfile = catalog.profiles.at(-1);

      if (!createdProfile) {
        throw new Error(t("home_controller.new_profile_unresolved"));
      }

      await switchProfileMutation.mutateAsync({
        profileId: createdProfile.id,
      });
      setIsCreateProfileDialogOpen(false);
      setNewProfileName("");
      setFeedback({
        tone: "success",
        message: t("home_controller.created_switched_to", {
          name: createdProfile.name,
        }),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("home_controller.failed_create_profile"),
      });
    }
  }

  async function handleDeleteProfile() {
    if (!currentProfileId || !currentProfile) {
      return;
    }

    try {
      const catalog = await deleteProfileMutation.mutateAsync({
        profileId: currentProfileId,
      });
      const nextProfile =
        catalog.profiles.find(
          (profile) => profile.id === catalog.currentProfileId,
        ) ?? null;

      setIsDeleteProfileDialogOpen(false);
      setFeedback({
        tone: "success",
        message: nextProfile
          ? t("home_controller.deleted_profile_active_now", {
              deleted: currentProfile.name,
              active: nextProfile.name,
            })
          : t("home_controller.deleted_profile", { name: currentProfile.name }),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("home_controller.failed_delete_profile"),
      });
    }
  }

  function handleOpenCreateProfileDialog() {
    if (!currentProfile) {
      return;
    }

    setNewProfileName(
      t("home_controller.copy_of", { name: currentProfile.name }),
    );
    setIsCreateProfileDialogOpen(true);
  }

  function handleOpenDeleteProfileDialog() {
    if (!currentProfile) {
      return;
    }

    setIsDeleteProfileDialogOpen(true);
  }

  async function handleRescanLibrary() {
    if (!currentProfileId || isDirty) {
      return;
    }

    if (rescanRequestRef.current) {
      return rescanRequestRef.current;
    }

    const rescanRequest = (async () => {
      try {
        setIsRescanInFlight(true);
        setFeedback(null);
        await modSourceSnapshotQuery.refetch({
          cancelRefetch: false,
          throwOnError: true,
        });

        setFeedback({
          tone: "success",
          message: t("home_controller.rescanned_success"),
        });
      } catch (error) {
        setFeedback({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : t("home_controller.failed_rescan"),
        });
      } finally {
        rescanRequestRef.current = null;
        setIsRescanInFlight(false);
      }
    })();

    rescanRequestRef.current = rescanRequest;

    return rescanRequest;
  }

  async function handleEnableMissingDependencies() {
    if (!currentProfileId || !analysis) {
      return;
    }

    const previousActiveCount = analysis.currentActivePackageIds.length;

    try {
      setFeedback(null);
      setIsDependencyDialogOpen(false);
      const nextActivePackageIds = resolveRecommendedActivePackageIds(
        analysis,
        ["enableMissingDependencies"],
      );
      await applyActivePackageIdsMutation.mutateAsync({
        profileId: currentProfileId,
        activePackageIds: nextActivePackageIds,
        applyToGame: true,
      });
      setDismissedDependencyAnalysisAt(new Date().toISOString());
      setFeedback({
        tone: "success",
        message: t("home_controller.enabled_missing_deps", {
          count: nextActivePackageIds.length - previousActiveCount,
        }),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("home_controller.failed_enable_deps"),
      });
    }
  }

  async function handleAutoSort() {
    if (!currentProfileId || !analysis) {
      return;
    }

    try {
      setFeedback(null);
      setIsSortDialogOpen(false);
      const nextActivePackageIds = resolveRecommendedActivePackageIds(
        analysis,
        ["reorderActiveMods"],
      );
      await applyActivePackageIdsMutation.mutateAsync({
        profileId: currentProfileId,
        activePackageIds: nextActivePackageIds,
        applyToGame: true,
      });
      setDismissedSortAnalysisAt(new Date().toISOString());
      setFeedback({
        tone: "success",
        message: t("home_controller.applied_recommended_order"),
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : t("home_controller.failed_apply_mod_order"),
      });
    }
  }

  return {
    activeMods,
    analysis,
    applyActivePackageIdsMutation,
    createProfileMutation,
    currentProfile,
    currentProfileId,
    currentGameVersion,
    currentOrderViolations,
    deleteProfileMutation,
    draftActivePackageIds,
    draftProfileName,
    feedback,
    filteredMods,
    handleAutoSort,
    handleCreateProfile,
    handleDeleteProfile,
    handleDropMod,
    handleEnableMissingDependencies,
    handleOpenCreateProfileDialog,
    handleOpenDeleteProfileDialog,
    handleProfileSwitch,
    handleRescanLibrary,
    handleSaveProfile,
    inactiveMods,
    isBusy,
    isCreateProfileDialogOpen,
    isDeleteProfileDialogOpen,
    isDependencyDialogOpen,
    isDirty,
    isFilterPanelOpen,
    isProfilePanelOpen,
    isRescanning,
    isSortDialogOpen,
    loadingOverlayVisible,
    modLibrary,
    modSourceSnapshotQuery,
    newProfileName,
    profileCatalogQuery,
    saveProfileMutation,
    searchQuery,
    selectedExplanation,
    selectedMod,
    selectedModId,
    setDraftProfileName,
    setFeedback,
    setIsFilterPanelOpen,
    setIsCreateProfileDialogOpen,
    setIsDeleteProfileDialogOpen,
    setIsDependencyDialogOpen,
    setIsProfilePanelOpen,
    setIsSortDialogOpen,
    setNewProfileName,
    setSearchQuery,
    setSelectedModId,
    setSourceFilter,
    sourceFilter,
    switchProfileMutation,
    setDismissedDependencyAnalysisAt,
    setDismissedSortAnalysisAt,
    visibleActiveMods,
    visibleInactiveMods,
  };
}

export type HomePageController = ReturnType<typeof useHomePageController>;
