import { useModLibraryQuery } from "@/features/mod-library/hooks/useModLibraryQuery";
import { useApplyModOrderRecommendationMutation } from "@/features/mod-order/hooks/useApplyModOrderRecommendationMutation";
import { useModOrderAnalysisQuery } from "@/features/mod-order/hooks/useModOrderAnalysisQuery";
import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { AlertDialog } from "@/shared/components/ui/alert-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { useDelayedBusy } from "@/shared/hooks/useDelayedBusy";
import { queryKeys } from "@/shared/lib/queryKeys";
import { cn } from "@/shared/lib/utils";
import type { ProfileCatalogResult } from "@rimun/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FolderSearch,
  HardDrive,
  Link2,
  LoaderCircle,
  Package,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router-dom";

function formatPathValue(path: string | null) {
  return path ?? "Not available";
}

function renderDescriptionBlocks(description: string | null) {
  if (!description) {
    return (
      <p className="text-sm text-muted-foreground">
        No description was found in About.xml.
      </p>
    );
  }

  return description
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line));

      if (lines.length > 0 && bulletLines.length === lines.length) {
        return (
          <ul
            key={`${index}:${block.slice(0, 16)}`}
            className="list-disc space-y-1 pl-5 text-sm leading-relaxed"
          >
            {lines.map((line) => (
              <li key={line}>{line.replace(/^[-*]\s+/, "")}</li>
            ))}
          </ul>
        );
      }

      return (
        <p
          key={`${index}:${block.slice(0, 16)}`}
          className="text-sm leading-relaxed text-foreground/90"
        >
          {lines.join(" ")}
        </p>
      );
    });
}

function renderPackageList(items: string[]) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">None</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} variant="outline" className="font-mono text-[11px]">
          {item}
        </Badge>
      ))}
    </div>
  );
}

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

type FeedbackState = {
  tone: FeedbackTone;
  message: string;
} | null;

type ActiveModEntry = {
  packageId: string;
  modName: string;
  source: string | null;
  isOfficial: boolean;
};

export function HomePage() {
  const queryClient = useQueryClient();
  const profileCatalogQuery = useQuery({
    queryKey: queryKeys.profileCatalog(),
    queryFn: async () => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.getProfileCatalog();
    },
  });
  const currentProfileId = profileCatalogQuery.data?.currentProfileId ?? null;
  const currentProfile =
    profileCatalogQuery.data?.profiles.find(
      (profile) => profile.id === currentProfileId,
    ) ?? null;
  const modLibraryQuery = useModLibraryQuery(currentProfileId);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModId, setSelectedModId] = useState<string | null>(null);
  const [draftProfileName, setDraftProfileName] = useState("");
  const [draftActivePackageIds, setDraftActivePackageIds] = useState<string[]>(
    [],
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
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
  const [asideWidth, setAsideWidth] = useState(44); // percentage

  const handleMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startWidth = asideWidth;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaPercent = (deltaX / window.innerWidth) * 100;
      // Limit width between 20% and 70%
      const newWidth = Math.min(Math.max(startWidth - deltaPercent, 20), 70);
      setAsideWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const createProfileMutation = useMutation({
    mutationFn: async (input: { name: string; sourceProfileId: string }) => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.createProfile(input);
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
      const rpcClient = await getRimunRpcClient();
      return rpcClient.switchProfile(input);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.profileCatalog(), result);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modLibraryRoot(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modOrderAnalysisRoot(),
      });
    },
  });
  const deleteProfileMutation = useMutation({
    mutationFn: async (input: { profileId: string }) => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.deleteProfile(input);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.profileCatalog(), result);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modLibraryRoot(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modOrderAnalysisRoot(),
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
      const rpcClient = await getRimunRpcClient();
      return rpcClient.saveProfile(input);
    },
    onSuccess: async (result, variables) => {
      queryClient.setQueryData(
        queryKeys.modLibrary(variables.profileId),
        result.modLibrary,
      );
      queryClient.setQueryData(
        queryKeys.modOrderAnalysis(variables.profileId),
        result.analysis,
      );
      queryClient.setQueryData(
        queryKeys.profileCatalog(),
        (current: ProfileCatalogResult | undefined) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            profiles: current.profiles.map((profile) =>
              profile.id === result.profile.id ? result.profile : profile,
            ),
          };
        },
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.profileCatalog(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modLibrary(variables.profileId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modOrderAnalysis(variables.profileId),
      });
    },
  });
  const applyRecommendationMutation = useApplyModOrderRecommendationMutation();

  const modLibrary = modLibraryQuery.data;
  const savedProfileName = currentProfile?.name ?? "";
  const savedActivePackageIds = modLibrary?.activePackageIds ?? [];
  const isDirty =
    currentProfile !== null &&
    ((draftProfileName.trim() || savedProfileName) !== savedProfileName ||
      !areStringArraysEqual(draftActivePackageIds, savedActivePackageIds));
  const analysisQuery = useModOrderAnalysisQuery(
    currentProfileId,
    Boolean(
      currentProfileId &&
        modLibrary &&
        !modLibraryQuery.isError &&
        !modLibrary.requiresConfiguration &&
        !isDirty,
    ),
  );

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
    analysisQuery.isPending ||
      applyRecommendationMutation.isPending ||
      createProfileMutation.isPending ||
      switchProfileMutation.isPending ||
      deleteProfileMutation.isPending ||
      saveProfileMutation.isPending,
    400,
  );
  const draftActiveSet = new Set(draftActivePackageIds);
  const mods = (modLibrary?.mods ?? []).map((mod) => ({
    ...mod,
    enabled: mod.dependencyMetadata.packageIdNormalized
      ? draftActiveSet.has(mod.dependencyMetadata.packageIdNormalized)
      : false,
  }));
  const modByPackageId = new Map(
    mods
      .filter((mod) => mod.dependencyMetadata.packageIdNormalized)
      .map((mod) => [mod.dependencyMetadata.packageIdNormalized ?? "", mod]),
  );
  const activeEntries: ActiveModEntry[] = draftActivePackageIds.map(
    (packageId) => {
      const mod = modByPackageId.get(packageId);

      return {
        packageId,
        modName: mod?.name ?? packageId,
        source: mod?.source ?? null,
        isOfficial: mod?.isOfficial ?? false,
      };
    },
  );
  const analysis = isDirty ? null : analysisQuery.data;
  const routeBlocker = useBlocker(isDirty);
  const term = searchQuery.trim().toLowerCase();

  const sortedMods = [...mods].sort((a, b) => {
    const aPackageId = a.dependencyMetadata.packageIdNormalized;
    const bPackageId = b.dependencyMetadata.packageIdNormalized;

    if (a.enabled && b.enabled) {
      if (!aPackageId || !bPackageId) return 0;
      return (
        draftActivePackageIds.indexOf(aPackageId) -
        draftActivePackageIds.indexOf(bPackageId)
      );
    }

    if (a.enabled) return -1;
    if (b.enabled) return 1;

    return a.name.localeCompare(b.name);
  });

  const filteredMods = sortedMods.filter((mod) => {
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
    applyRecommendationMutation.isPending;
  const isRescanning =
    modLibraryQuery.isFetching || (!isDirty && analysisQuery.isFetching);

  useBeforeUnload((event) => {
    if (!isDirty) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

  useEffect(() => {
    if (!analysis || applyRecommendationMutation.isPending || isDirty) {
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
    applyRecommendationMutation.isPending,
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
      await Promise.all([
        modLibraryQuery.refetch(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.modOrderAnalysis(currentProfileId),
        }),
      ]);

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
      const result = await applyRecommendationMutation.mutateAsync({
        profileId: currentProfileId,
        actions: ["enableMissingDependencies"],
      });
      setDismissedDependencyAnalysisAt(result.analysis.analyzedAt);
      setFeedback({
        tone: "success",
        message: `Enabled ${result.analysis.currentActivePackageIds.length - previousActiveCount} missing dependency mods.`,
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
    if (!currentProfileId) {
      return;
    }

    try {
      setFeedback(null);
      setIsSortDialogOpen(false);
      const result = await applyRecommendationMutation.mutateAsync({
        profileId: currentProfileId,
        actions: ["reorderActiveMods"],
      });
      setDismissedSortAnalysisAt(result.analysis.analyzedAt);
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

  if (profileCatalogQuery.isPending || modLibraryQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center bg-background/40">
        <p className="font-black uppercase tracking-widest text-primary rw-text animate-pulse">
          Loading Profiles...
        </p>
      </div>
    );
  }

  if (profileCatalogQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-xl border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Failed To Load Profiles
            </CardTitle>
            <CardDescription>
              The desktop backend did not return the available mod profiles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (modLibraryQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-xl border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Failed To Load Mod Library
            </CardTitle>
            <CardDescription>
              The desktop backend did not return a mod scan result.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!modLibrary) {
    return null;
  }

  if (modLibrary.requiresConfiguration) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-2xl border-border/60 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <HardDrive className="h-6 w-6 text-primary" />
              Mod Library Needs Configuration
            </CardTitle>
            <CardDescription>
              A RimWorld installation path must be saved before the backend can
              scan local or workshop mods.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {modLibrary.errors.length ? (
              <div className="space-y-3">
                {modLibrary.errors.map((error) => (
                  <div
                    key={`${error.code}:${error.message}`}
                    className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
                  >
                    <p className="text-sm font-bold text-destructive">
                      {error.message}
                    </p>
                    {error.detail ? (
                      <p className="mt-1 text-sm text-destructive/80">
                        {error.detail}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <Link to="/settings">
              <Button className="gap-2">
                <FolderSearch className="h-4 w-4" />
                Open Core Config
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="relative flex h-full w-full bg-background/20">
        {loadingOverlayVisible ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/75 backdrop-blur-sm">
            <div className="rounded-2xl border border-border/60 bg-card/95 px-8 py-6 text-center shadow-2xl">
              <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-primary">
                {applyRecommendationMutation.isPending
                  ? "Applying Recommendation"
                  : saveProfileMutation.isPending
                    ? "Saving Profile"
                    : switchProfileMutation.isPending
                      ? "Switching Profile"
                      : createProfileMutation.isPending
                        ? "Creating Profile"
                        : deleteProfileMutation.isPending
                          ? "Deleting Profile"
                          : "Analyzing Load Order"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {applyRecommendationMutation.isPending
                  ? "Updating the active mod list for the current profile."
                  : saveProfileMutation.isPending
                    ? "Writing the current draft into the selected profile and RimWorld."
                    : switchProfileMutation.isPending
                      ? "Applying the selected profile into ModsConfig.xml."
                      : createProfileMutation.isPending
                        ? "Cloning the current saved profile."
                        : deleteProfileMutation.isPending
                          ? "Removing the selected profile and applying the fallback."
                          : "Building the dependency graph for the current saved profile."}
              </p>
            </div>
          </div>
        ) : null}

        <section 
          className="flex min-w-0 flex-col border-r border-border/60"
          style={{ width: `${100 - asideWidth}%` }}
        >
          <header className="border-b border-border/40 bg-card/10 px-6 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-2xl font-black uppercase tracking-tight rw-text whitespace-nowrap">
                    Mod Library
                  </h2>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold border-primary/20 bg-primary/5 text-primary">
                      {draftActivePackageIds.length} Active
                    </Badge>
                    <span>/</span>
                    <span>{modLibrary.mods.length} Total</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Filter Mods..."
                      className="h-9 w-full pl-9 text-xs font-bold sm:w-60"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2 text-xs"
                    disabled={
                      isBusy ||
                      isRescanning ||
                      isDirty ||
                      !currentProfileId ||
                      modLibrary.requiresConfiguration
                    }
                    onClick={() => void handleRescanLibrary()}
                  >
                    {isRescanning ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                    Rescan
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/50 p-3">
                <div className="flex flex-1 items-center gap-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mr-1">
                    Profile
                  </p>
                  <select
                    aria-label="Profile"
                    className="h-8 rounded-md border border-input bg-background px-2 py-0 text-xs font-bold min-w-[120px]"
                    disabled={isBusy || !currentProfileId}
                    value={currentProfileId ?? ""}
                    onChange={(event) =>
                      void handleProfileSwitch(event.target.value)
                    }
                  >
                    {profileCatalogQuery.data?.profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    aria-label="Profile Name"
                    className="h-8 max-w-[180px] text-xs font-bold"
                    disabled={isBusy || !currentProfile}
                    value={draftProfileName}
                    onChange={(event) => {
                      setFeedback(null);
                      setDraftProfileName(event.target.value);
                    }}
                  />
                  <div className="flex gap-1 ml-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="New Profile"
                      disabled={isBusy || !currentProfileId}
                      onClick={handleOpenCreateProfileDialog}
                    >
                      <Package className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="Delete Profile"
                      disabled={isBusy || !currentProfileId}
                      onClick={handleOpenDeleteProfileDialog}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-8 gap-2 text-xs"
                    disabled={isBusy || !currentProfile || !isDirty}
                    onClick={() => void handleSaveProfile()}
                  >
                    <Save className="h-4 w-4" />
                    Save Changes
                  </Button>
                  {isDirty ? (
                    <Badge variant="secondary" className="h-6 text-[10px] px-2">
                      Unsaved
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-6 text-[10px] px-2 text-primary">
                      Saved
                    </Badge>
                  )}
                </div>
              </div>

              {feedback ? (
                <output
                  aria-live="polite"
                  className={
                    feedback.tone === "success"
                      ? "rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[11px] font-bold text-primary"
                      : feedback.tone === "warning"
                        ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-700"
                        : "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] font-bold text-destructive"
                  }
                >
                  {feedback.message}
                </output>
              ) : null}

              {isDirty ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-700">
                  Save profile to enable dependency fixes and auto-sorting.
                </div>
              ) : null}
            </div>
          </header>

          <div className="flex items-center gap-3 border-b border-border/40 bg-background/30 px-6 py-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mr-1">
                Status
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-7 gap-2 px-3 border-border/60 bg-card/60">
                  <span className="text-[9px] text-muted-foreground uppercase">Load Order</span>
                  <span className="text-xs font-black">
                    {isDirty
                      ? "DRAFT"
                      : analysis
                        ? analysis.isOptimal
                          ? "OPTIMAL"
                          : "SUBOPTIMAL"
                        : "—"}
                  </span>
                </Badge>
                <Badge variant="outline" className="h-7 gap-2 px-3 border-border/60 bg-card/60">
                  <span className="text-[9px] text-muted-foreground uppercase">Missing</span>
                  <span className="text-xs font-black">
                    {analysis ? analysis.missingUnavailableDependencies.length : "—"}
                  </span>
                </Badge>
                <Badge variant="outline" className="h-7 gap-2 px-3 border-border/60 bg-card/60">
                  <span className="text-[9px] text-muted-foreground uppercase">Auto-Fix</span>
                  <span className="text-xs font-black">
                    {analysis ? analysis.missingInstalledInactiveDependencies.length : "—"}
                  </span>
                </Badge>
                <Badge variant="outline" className="h-7 gap-2 px-3 border-border/60 bg-card/60">
                  <span className="text-[9px] text-muted-foreground uppercase">Diffs</span>
                  <span className="text-xs font-black">
                    {analysis ? analysis.sortDifferenceCount : "—"}
                  </span>
                </Badge>
              </div>
            </div>
          </div>

          {analysis ? (
            <div className="border-b border-border/40 bg-card/10 px-6 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={analysis.isOptimal ? "default" : "secondary"} className="h-6 text-[10px]">
                    {analysis.isOptimal
                      ? "Optimal Load Order"
                      : "Review Recommended"}
                  </Badge>
                  {analysis.hasBlockingIssues ? (
                    <Badge variant="destructive" className="h-6 text-[10px]">Blocking Issues</Badge>
                  ) : null}
                  {analysis.sortDifferenceCount > 0 ? (
                    <Badge variant="outline" className="h-6 text-[10px] gap-1">
                      <ArrowUpDown className="h-3 w-3" />
                      Reorder Suggested
                    </Badge>
                  ) : null}
                </div>
                
                <div className="flex items-center gap-2">
                  {!analysis.isOptimal && !isDirty && !analysis.hasBlockingIssues && analysis.sortDifferenceCount > 0 && (
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      className="h-7 px-3 text-[10px] gap-1.5 font-black uppercase"
                      onClick={() => void handleAutoSort()}
                      disabled={isBusy}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Auto Sort
                    </Button>
                  )}
                  {analysis.missingInstalledInactiveDependencies.length > 0 && !isDirty && (
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      className="h-7 px-3 text-[10px] gap-1.5 font-black uppercase"
                      onClick={() => void handleEnableMissingDependencies()}
                      disabled={isBusy}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Fix Dependencies
                    </Button>
                  )}
                  <span className="text-[9px] font-medium text-muted-foreground ml-2">
                    Analysis: {new Date(analysis.analyzedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          ) : isDirty ? (
            <div className="border-b border-amber-500/20 bg-amber-500/5 px-6 py-2 text-[10px] font-bold text-amber-700">
              Analysis paused for unsaved changes.
            </div>
          ) : null}

          <div className="sticky top-0 z-10 flex items-center px-6 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-background border-b border-border/20">
            <div className="w-10 text-center">Use</div>
            <div className="flex-1">Mod</div>
            <div className="w-24 text-center">Source</div>
            <div className="w-20 text-right">Version</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredMods.length ? (
              filteredMods.map((mod, index) => {
                const isSelected = selectedMod?.id === mod.id;
                const packageId = mod.dependencyMetadata.packageIdNormalized;
                const activeIndex = packageId ? draftActivePackageIds.indexOf(packageId) : -1;

                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedModId(mod.id)}
                    className={cn(
                      "group flex w-full items-center border-b border-border/10 px-6 py-2 text-left transition-colors",
                      isSelected ? "bg-accent/40" : index % 2 === 0 ? "bg-background/20" : "bg-muted/10",
                      "hover:bg-accent/20"
                    )}
                  >
                    <div className="flex w-10 justify-center shrink-0">
                      <Checkbox
                        aria-label={`Toggle ${mod.name}`}
                        checked={mod.enabled}
                        disabled={!packageId || isBusy}
                        onChange={() => {
                          if (!packageId) {
                            return;
                          }

                          toggleMod(packageId);
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>
                    
                    <div className="w-8 flex flex-col items-center justify-center shrink-0 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {mod.enabled && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-4 w-4 p-0 hover:bg-primary/20"
                            disabled={isBusy || activeIndex === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (packageId) moveActivePackageId(packageId, "up");
                            }}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-4 w-4 p-0 hover:bg-primary/20"
                            disabled={isBusy || activeIndex === draftActivePackageIds.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (packageId) moveActivePackageId(packageId, "down");
                            }}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          {mod.enabled && (
                            <span className="text-[10px] font-black text-primary/70 shrink-0 w-4">
                              {activeIndex + 1}.
                            </span>
                          )}
                          <span className={cn(
                            "truncate text-xs font-bold",
                            !mod.enabled && "text-muted-foreground font-medium"
                          )}>
                            {mod.name}
                          </span>
                        </div>
                        <span className="truncate font-mono text-[9px] text-muted-foreground/60">
                          {mod.packageId ?? mod.windowsPath}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        {mod.isOfficial && (
                          <Badge variant="secondary" className="h-4 text-[8px] px-1 uppercase">Official</Badge>
                        )}
                        {!mod.hasAboutXml && (
                          <Badge variant="destructive" className="h-4 text-[8px] px-1 uppercase">No Meta</Badge>
                        )}
                        <Badge variant="outline" className="h-4 text-[8px] px-1 uppercase opacity-70">
                          {mod.source}
                        </Badge>
                      </div>
                    </div>

                    <div className="w-20 text-right text-[9px] font-bold text-muted-foreground/80 shrink-0">
                      {mod.version ?? "?.?"}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-center">
                <div className="space-y-3">
                  <Package className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="text-lg font-black uppercase tracking-[0.2em] rw-text">
                    No Matching Mods
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Adjust the filter or use Rescan Library after changing
                    paths.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between border-t border-border/40 bg-card/10 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <span>
              Scanned At: {new Date(modLibrary.scannedAt).toLocaleString()}
            </span>
            <span>{filteredMods.length} Visible</span>
          </div>
        </section>

        {/* Resizer Handle */}
        <div 
          className="w-1.5 h-full cursor-col-resize hover:bg-primary/20 transition-colors flex items-center justify-center shrink-0 z-20 group"
          onMouseDown={handleMouseDown}
        >
          <div className="w-[1px] h-12 bg-border group-hover:bg-primary/50" />
        </div>

        <aside 
          className="flex min-w-0 flex-col bg-card/10 overflow-hidden"
          style={{ width: `${asideWidth}%` }}
        >
          {selectedMod ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <header className="border-b border-border/40 bg-background/30 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase tracking-wide rw-text leading-tight">
                      {selectedMod.name}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge
                        variant={selectedMod.enabled ? "default" : "outline"}
                        className="h-5 text-[9px]"
                      >
                        {selectedMod.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge variant="outline" className="h-5 text-[9px] uppercase">
                        {selectedMod.source}
                      </Badge>
                      {selectedMod.isOfficial ? (
                        <Badge variant="secondary" className="h-5 text-[9px]">Official</Badge>
                      ) : null}
                    </div>
                  </div>
                  {selectedMod.isOfficial ? (
                    <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 grid-cols-2">
                  <div className="rounded-lg border border-border/40 bg-background/20 p-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      Package ID
                    </p>
                    <p className="mt-1 break-all font-mono text-[10px] font-bold">
                      {selectedMod.packageId ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-background/20 p-2.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      Author / Version
                    </p>
                    <p className="mt-1 text-[11px] font-bold truncate">
                      {selectedMod.author ?? "Unknown"}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      v{selectedMod.version ?? "Unknown"}
                    </p>
                  </div>
                </div>
              </header>

              <div className="flex-1 space-y-5 overflow-y-auto p-6 scrollbar-thin">
                {analysis?.hasBlockingIssues && (
                  <section className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      Blocking Diagnostics
                    </p>
                    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                      {analysis.missingUnavailableDependencies.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-destructive">
                            Uninstalled dependencies:
                          </p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-[10px] text-destructive/90">
                            {analysis.missingUnavailableDependencies.map((issue) => (
                              <li key={issue.packageId}>
                                <span className="font-mono font-bold">{issue.packageId}</span> (required by {issue.requiredByNames.join(", ")})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    Description
                  </p>
                  <div className="space-y-2.5 rounded-lg border border-border/40 bg-background/40 p-3.5 text-xs leading-relaxed">
                    {renderDescriptionBlocks(selectedMod.description)}
                  </div>
                </section>

                <section className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    Dependency Hints
                  </p>
                  <div className="grid gap-3 rounded-lg border border-border/40 bg-background/40 p-3.5">
                    {[
                      { label: "Dependencies", items: selectedMod.dependencyMetadata.dependencies },
                      { label: "Load After", items: selectedMod.dependencyMetadata.loadAfter },
                      { label: "Load Before", items: selectedMod.dependencyMetadata.loadBefore },
                      { label: "Incompatible", items: selectedMod.dependencyMetadata.incompatibleWith },
                    ].map(({ label, items }) => (
                      <div key={label}>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                          {label}
                        </p>
                        {renderPackageList(items)}
                      </div>
                    ))}
                  </div>
                </section>

                {selectedExplanation?.reasons.length ? (
                  <section className="space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      Order Analysis
                    </p>
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                      <ul className="list-disc space-y-1.5 pl-4 text-[11px] text-foreground/80">
                        {selectedExplanation.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                ) : null}

                <section className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    Paths & Metadata
                  </p>
                  <div className="rounded-lg border border-border/40 bg-background/40 p-3.5 space-y-2 font-mono text-[10px]">
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase mb-0.5">Physical Location</p>
                      <p className="break-all">{selectedMod.windowsPath}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-muted-foreground uppercase mb-0.5">About.xml</p>
                      <p className="break-all">{selectedMod.manifestPath ?? "N/A"}</p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-12 text-center">
              <div className="space-y-3 opacity-50">
                <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-black uppercase tracking-[0.2em] rw-text">
                  No Mod Selected
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      <AlertDialog
        open={routeBlocker.state === "blocked"}
        title="Discard Unsaved Profile Changes?"
        description="You have unsaved profile edits. Leaving this page now will discard the current draft."
        confirmLabel="Discard Changes"
        cancelLabel="Stay Here"
        tone="warning"
        onConfirm={() => routeBlocker.proceed?.()}
        onCancel={() => routeBlocker.reset?.()}
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Save the profile first if you want to keep the current active mod
            list, ordering, and profile name edits.
          </p>
        </div>
      </AlertDialog>

      <AlertDialog
        open={isCreateProfileDialogOpen}
        title="Create New Profile"
        description="Create a new profile from the current saved snapshot."
        confirmLabel="Create Profile"
        cancelLabel="Cancel"
        tone="default"
        busy={
          createProfileMutation.isPending ||
          switchProfileMutation.isPending ||
          saveProfileMutation.isPending
        }
        confirmDisabled={!newProfileName.trim()}
        onConfirm={() => void handleCreateProfile()}
        onCancel={() => {
          if (
            createProfileMutation.isPending ||
            switchProfileMutation.isPending ||
            saveProfileMutation.isPending
          ) {
            return;
          }

          setIsCreateProfileDialogOpen(false);
          setNewProfileName("");
        }}
      >
        <div className="space-y-3">
          <label
            htmlFor="new-profile-name"
            className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground"
          >
            Profile Name
          </label>
          <Input
            id="new-profile-name"
            autoFocus
            value={newProfileName}
            onChange={(event) => setNewProfileName(event.target.value)}
            placeholder="Combat Run"
            onKeyDown={(event) => {
              if (event.key === "Enter" && newProfileName.trim()) {
                event.preventDefault();
                void handleCreateProfile();
              }
            }}
          />
          {isDirty ? (
            <p className="text-sm text-amber-700">
              The current draft will be saved before the new profile is cloned.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              The new profile starts from the currently saved mod set and load
              order.
            </p>
          )}
        </div>
      </AlertDialog>

      <AlertDialog
        open={isDeleteProfileDialogOpen}
        title="Delete Selected Profile?"
        description="Delete the selected profile and switch to the backend-provided fallback profile."
        confirmLabel="Delete Profile"
        cancelLabel="Keep Profile"
        tone="danger"
        busy={deleteProfileMutation.isPending}
        onConfirm={() => void handleDeleteProfile()}
        onCancel={() => {
          if (deleteProfileMutation.isPending) {
            return;
          }

          setIsDeleteProfileDialogOpen(false);
        }}
      >
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-bold text-foreground">
              {currentProfile?.name ?? "Current profile"}
            </span>{" "}
            will be removed from the catalog.
          </p>
          {isDirty ? (
            <p className="font-bold text-destructive">
              Unsaved changes in this profile will be discarded.
            </p>
          ) : (
            <p className="text-muted-foreground">
              The active profile will switch to the repository fallback after
              deletion.
            </p>
          )}
        </div>
      </AlertDialog>

      <AlertDialog
        open={isDependencyDialogOpen}
        title="Enable Missing Dependencies?"
        description="Some active mods are missing required dependencies that are already installed in your library."
        confirmLabel="Enable Dependencies"
        cancelLabel="Keep Current State"
        tone="warning"
        busy={applyRecommendationMutation.isPending}
        onConfirm={() => void handleEnableMissingDependencies()}
        onCancel={() => {
          setIsDependencyDialogOpen(false);
          if (analysis) {
            setDismissedDependencyAnalysisAt(analysis.analyzedAt);
          }
          setFeedback({
            tone: "warning",
            message:
              "Skipped automatic dependency activation. The current active list may remain incomplete.",
          });
        }}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-background/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
              Mods To Enable
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {analysis?.missingInstalledInactiveDependencies.map((issue) => (
                <li key={issue.packageId}>
                  {issue.modName ?? issue.packageId} required by{" "}
                  {issue.requiredByNames.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </AlertDialog>

      <AlertDialog
        open={isSortDialogOpen}
        title="Apply Recommended Sort Order?"
        description="The current active mod order is not the recommended load order. Rimun can update the current profile and rewrite ModsConfig.xml with the suggested sequence."
        confirmLabel="Auto Sort"
        cancelLabel="Keep Current Order"
        tone="default"
        busy={applyRecommendationMutation.isPending}
        onConfirm={() => void handleAutoSort()}
        onCancel={() => {
          setIsSortDialogOpen(false);
          if (analysis) {
            setDismissedSortAnalysisAt(analysis.analyzedAt);
          }
          setFeedback({
            tone: "warning",
            message:
              "Skipped automatic sorting. The current active list order may still be suboptimal.",
          });
        }}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-background/70 p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Recommended Active Order
            </p>
            <ol className="mt-3 space-y-1 text-sm">
              {analysis?.recommendedOrderPackageIds.map((packageId, index) => (
                <li key={packageId} className="font-mono">
                  {index + 1}. {packageId}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </AlertDialog>
    </>
  );
}
