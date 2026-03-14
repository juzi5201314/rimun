import { useModSourceSnapshotQuery } from "@/features/mod-source/hooks/useModSourceSnapshotQuery";
import { useDelayedBusy } from "@/shared/hooks/useDelayedBusy";
import { useHostApi } from "@/shared/host/HostApiProvider";
import { queryKeys } from "@/shared/lib/queryKeys";
import {
  analyzeModOrder,
  buildModLibraryFromSnapshot,
  resolveRecommendedActivePackageIds,
} from "@rimun/domain";
import type { ModRecord, ProfileCatalogResult } from "@rimun/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
}

function moveItem(items: string[], currentIndex: number, nextIndex: number) {
  if (
    currentIndex < 0 ||
    currentIndex >= items.length ||
    nextIndex < 0 ||
    nextIndex >= items.length ||
    currentIndex === nextIndex
  ) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(currentIndex, 1);

  if (!movedItem) {
    return items;
  }

  nextItems.splice(nextIndex, 0, movedItem);

  return nextItems;
}

type FeedbackTone = "success" | "warning" | "error";

export type HomePageFeedbackState = {
  tone: FeedbackTone;
  message: string;
} | null;

export function useHomePageController() {
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
  const [selectedModId, setSelectedModId] = useState<string | null>(null);
  const [draftProfileName, setDraftProfileName] = useState("");
  const [draftActivePackageIds, setDraftActivePackageIds] = useState<string[]>(
    [],
  );
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
  const [activationFilter, setActivationFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "local" | "workshop"
  >("all");
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

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
  const savedProfileName = currentProfile?.name ?? "";
  const savedActivePackageIds = modLibrary?.activePackageIds ?? [];
  const isDirty =
    currentProfile !== null &&
    ((draftProfileName.trim() || savedProfileName) !== savedProfileName ||
      !areStringArraysEqual(draftActivePackageIds, savedActivePackageIds));
  const computedAnalysis = useMemo(() => {
    if (!modLibrary || modLibrary.requiresConfiguration) {
      return null;
    }

    return analyzeModOrder(modLibrary);
  }, [modLibrary]);

  useEffect(() => {
    if (!currentProfileId) {
      return;
    }

    setSearchQuery("");
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

    setDraftProfileName(currentProfile.name);
    setDraftActivePackageIds(modLibrary.activePackageIds);
  }, [currentProfile, modLibrary]);

  const loadingOverlayVisible = useDelayedBusy(
    applyActivePackageIdsMutation.isPending ||
      createProfileMutation.isPending ||
      switchProfileMutation.isPending ||
      deleteProfileMutation.isPending ||
      saveProfileMutation.isPending,
    400,
  );
  const draftActiveSet = new Set(draftActivePackageIds);
  const mods: ModRecord[] = (modLibrary?.mods ?? []).map((mod) => ({
    ...mod,
    enabled: mod.dependencyMetadata.packageIdNormalized
      ? draftActiveSet.has(mod.dependencyMetadata.packageIdNormalized)
      : false,
  }));
  const analysis = isDirty ? null : computedAnalysis;
  const term = searchQuery.trim().toLowerCase();

  const sortedMods = [...mods].sort((a, b) => {
    const aPackageId = a.dependencyMetadata.packageIdNormalized;
    const bPackageId = b.dependencyMetadata.packageIdNormalized;

    if (a.enabled && b.enabled) {
      if (!aPackageId || !bPackageId) {
        return 0;
      }

      return (
        draftActivePackageIds.indexOf(aPackageId) -
        draftActivePackageIds.indexOf(bPackageId)
      );
    }

    if (a.enabled) {
      return -1;
    }

    if (b.enabled) {
      return 1;
    }

    return a.name.localeCompare(b.name);
  });
  const filteredMods = sortedMods.filter((mod) => {
    if (activationFilter === "active" && !mod.enabled) {
      return false;
    }

    if (activationFilter === "inactive" && mod.enabled) {
      return false;
    }

    if (sourceFilter === "local" && mod.source !== "installation") {
      return false;
    }

    if (sourceFilter === "workshop" && mod.source !== "workshop") {
      return false;
    }

    if (!term) {
      return true;
    }

    return [mod.name, mod.packageId ?? "", mod.author ?? ""].some((field) =>
      field.toLowerCase().includes(term),
    );
  });
  const selectedMod =
    filteredMods.find((mod) => mod.id === selectedModId) ??
    mods.find((mod) => mod.id === selectedModId) ??
    filteredMods[0] ??
    mods[0] ??
    null;
  const selectedPackageId =
    selectedMod?.dependencyMetadata.packageIdNormalized ?? null;
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
  const isRescanning = modSourceSnapshotQuery.isFetching;

  useEffect(() => {
    if (!analysis || applyActivePackageIdsMutation.isPending || isDirty) {
      return;
    }

    if (analysis.missingInstalledInactiveDependencies.length > 0) {
      if (dismissedDependencyAnalysisAt !== analysis.analyzedAt) {
        setIsDependencyDialogOpen(true);
      }
      return;
    }

    if (
      !analysis.hasBlockingIssues &&
      analysis.sortDifferenceCount > 0 &&
      dismissedSortAnalysisAt !== analysis.analyzedAt
    ) {
      setIsSortDialogOpen(true);
    }
  }, [
    analysis,
    applyActivePackageIdsMutation.isPending,
    dismissedDependencyAnalysisAt,
    dismissedSortAnalysisAt,
    isDirty,
  ]);

  function updateDraftActivePackageIds(
    updater: (activePackageIds: string[]) => string[],
  ) {
    setFeedback(null);
    setDraftActivePackageIds((currentActivePackageIds) =>
      updater(currentActivePackageIds),
    );
  }

  function toggleMod(packageId: string) {
    updateDraftActivePackageIds((currentActivePackageIds) =>
      currentActivePackageIds.includes(packageId)
        ? currentActivePackageIds.filter((currentId) => currentId !== packageId)
        : [...currentActivePackageIds, packageId],
    );
  }

  function moveActivePackageId(
    packageId: string,
    direction: "up" | "down" | "top" | "bottom",
  ) {
    updateDraftActivePackageIds((currentActivePackageIds) => {
      const currentIndex = currentActivePackageIds.indexOf(packageId);

      if (currentIndex < 0) {
        return currentActivePackageIds;
      }

      switch (direction) {
        case "up":
          return moveItem(
            currentActivePackageIds,
            currentIndex,
            currentIndex - 1,
          );
        case "down":
          return moveItem(
            currentActivePackageIds,
            currentIndex,
            currentIndex + 1,
          );
        case "top":
          return moveItem(currentActivePackageIds, currentIndex, 0);
        case "bottom":
          return moveItem(
            currentActivePackageIds,
            currentIndex,
            currentActivePackageIds.length - 1,
          );
      }
    });
  }

  async function persistDraft(options: {
    applyToGame: boolean;
    feedbackMessage: string;
  }) {
    if (!currentProfileId || !currentProfile) {
      throw new Error("No profile is selected.");
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
        feedbackMessage: "Profile saved and applied to RimWorld.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to save the profile.",
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
          feedbackMessage: "Saved current profile before switching.",
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
          ? `Switched to ${switchedProfile.name}.`
          : "Switched profile.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to switch mod profile.",
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
          feedbackMessage: "Saved current profile before creating a new one.",
        });
      }

      const catalog = await createProfileMutation.mutateAsync({
        name,
        sourceProfileId: currentProfileId,
      });
      const createdProfile = catalog.profiles.at(-1);

      if (!createdProfile) {
        throw new Error("The new profile could not be resolved.");
      }

      await switchProfileMutation.mutateAsync({
        profileId: createdProfile.id,
      });
      setIsCreateProfileDialogOpen(false);
      setNewProfileName("");
      setFeedback({
        tone: "success",
        message: `Created and switched to ${createdProfile.name}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to create a new profile.",
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
          ? `Deleted ${currentProfile.name}. Active profile is now ${nextProfile.name}.`
          : `Deleted ${currentProfile.name}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to delete the profile.",
      });
    }
  }

  function handleOpenCreateProfileDialog() {
    if (!currentProfile) {
      return;
    }

    setNewProfileName(`Copy of ${currentProfile.name}`);
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

    try {
      setFeedback(null);
      await modSourceSnapshotQuery.refetch();

      setFeedback({
        tone: "success",
        message: "Mod library rescanned from the current configured roots.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to rescan mod roots.",
      });
    }
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
        message: `Enabled ${nextActivePackageIds.length - previousActiveCount} missing dependency mods.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to enable missing dependencies.",
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
        message: "Applied the recommended active mod order.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Failed to apply mod order.",
      });
    }
  }

  return {
    analysis,
    applyActivePackageIdsMutation,
    activationFilter,
    createProfileMutation,
    currentProfile,
    currentProfileId,
    deleteProfileMutation,
    draftActivePackageIds,
    draftProfileName,
    feedback,
    filteredMods,
    handleAutoSort,
    handleCreateProfile,
    handleDeleteProfile,
    handleEnableMissingDependencies,
    handleOpenCreateProfileDialog,
    handleOpenDeleteProfileDialog,
    handleProfileSwitch,
    handleRescanLibrary,
    handleSaveProfile,
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
    setActivationFilter,
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
    toggleMod,
    moveActivePackageId,
    setDismissedDependencyAnalysisAt,
    setDismissedSortAnalysisAt,
  };
}

export type HomePageController = ReturnType<typeof useHomePageController>;
