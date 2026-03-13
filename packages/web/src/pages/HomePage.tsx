import {
  buildModLibraryFromSnapshot,
  analyzeModOrder,
  resolveRecommendedActivePackageIds,
} from "@rimun/domain";
import { useModSourceSnapshotQuery } from "@/features/mod-source/hooks/useModSourceSnapshotQuery";
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
import { useHostApi } from "@/shared/host/HostApiProvider";
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
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router-dom";

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

export function HomePage() {
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
  const [activationFilter, setActivationFilter] = useState<"all" | "active" | "inactive">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "local" | "workshop">("all");

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
  const mods = (modLibrary?.mods ?? []).map((mod) => ({
    ...mod,
    enabled: mod.dependencyMetadata.packageIdNormalized
      ? draftActiveSet.has(mod.dependencyMetadata.packageIdNormalized)
      : false,
  }));
  const analysis = isDirty ? null : computedAnalysis;
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
    // 1. Activation Filter
    if (activationFilter === "active" && !mod.enabled) return false;
    if (activationFilter === "inactive" && mod.enabled) return false;

    // 2. Source Filter
    if (sourceFilter === "local" && mod.source !== "installation") return false;
    if (sourceFilter === "workshop" && mod.source !== "workshop") return false;

    // 3. Search Term
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

  useBeforeUnload((event) => {
    if (!isDirty) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

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

  if (profileCatalogQuery.isPending || modSourceSnapshotQuery.isPending) {
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

  if (modSourceSnapshotQuery.isError) {
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
      <div className="flex-1 flex min-h-0 w-full relative bg-background/5">
        {loadingOverlayVisible ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md">
            <div className="rounded-2xl border border-border/40 bg-card/95 px-10 py-8 text-center shadow-2xl ring-1 ring-primary/10">
              <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-primary" />
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.4em] text-primary/80">
                {applyActivePackageIdsMutation.isPending
                  ? "Synchronizing Order"
                  : saveProfileMutation.isPending
                    ? "Persisting Data"
                    : switchProfileMutation.isPending
                      ? "Loading Profile"
                      : createProfileMutation.isPending
                        ? "Generating Profile"
                        : deleteProfileMutation.isPending
                          ? "Removing Record"
                          : "Analyzing Dependencies"}
              </p>
            </div>
          </div>
        ) : null}

        {/* Main Mod Management Area */}
        <section 
          className="flex min-w-0 flex-col border-r border-border/60 bg-background/20"
          style={{ width: `${100 - asideWidth}%` }}
        >
          {/* Unified Header */}
          <header className="shrink-0 border-b border-border/60 bg-card/30 px-6 py-5">
            <div className="flex flex-col gap-5">
              {/* Row 1: Title and Core Actions */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-black uppercase tracking-tight rw-text text-foreground/90">
                    Mod Library
                  </h2>
                  <div className="h-4 w-[1px] bg-border/60" />
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    <span className="text-primary font-black">{draftActivePackageIds.length}</span>
                    <span>Active</span>
                    <span className="opacity-40">/</span>
                    <span>{modLibrary.mods.length} Total</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
                    <Input
                      placeholder="Search mods, authors, ids..."
                      className="h-8 w-48 pl-8 text-[11px] font-medium bg-background/40 border-border/40 focus:w-64 transition-all"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2 text-[10px] font-bold uppercase tracking-wider px-3 border-border/60 hover:bg-background/60"
                    disabled={isBusy || isRescanning || isDirty || !currentProfileId}
                    onClick={() => void handleRescanLibrary()}
                  >
                    {isRescanning ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                    Rescan
                  </Button>
                </div>
              </div>

              {/* Row 2: Profile & Filter Toolbar */}
              <div className="flex items-center justify-between gap-4 py-0.5">
                <div className="flex items-center gap-2 bg-background/40 rounded-lg p-1 border border-border/40 ring-1 ring-black/5 shadow-inner">
                  <div className="flex items-center px-2 py-1 gap-2 border-r border-border/40 mr-1">
                    <Package className="h-3 w-3 text-muted-foreground/60" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">Profile</span>
                  </div>
                  
                  <select
                    aria-label="Profile Selection"
                    className="h-7 rounded-md border-none bg-transparent px-2 text-[11px] font-bold text-foreground focus:ring-0 cursor-pointer min-w-[100px]"
                    disabled={isBusy || !currentProfileId}
                    value={currentProfileId ?? ""}
                    onChange={(event) => void handleProfileSwitch(event.target.value)}
                  >
                    {profileCatalogQuery.data?.profiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  <Input
                    aria-label="Profile Name"
                    className="h-7 w-32 border-none bg-background/40 px-2 text-[11px] font-bold text-primary focus-visible:ring-1 focus-visible:ring-primary/20"
                    disabled={isBusy || !currentProfile}
                    value={draftProfileName}
                    onChange={(event) => {
                      setFeedback(null);
                      setDraftProfileName(event.target.value);
                    }}
                  />

                  <div className="flex items-center gap-0.5 px-1 border-l border-border/40 ml-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      title="New Profile"
                      onClick={handleOpenCreateProfileDialog}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Delete Profile"
                      onClick={handleOpenDeleteProfileDialog}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 pl-2 border-l border-border/40 ml-1 pr-1">
                    <Button
                      size="sm"
                      variant={isDirty ? "default" : "ghost"}
                      className={cn(
                        "h-7 gap-2 text-[10px] font-black uppercase px-3",
                        !isDirty && "text-muted-foreground opacity-50"
                      )}
                      disabled={isBusy || !currentProfile || !isDirty}
                      onClick={() => void handleSaveProfile()}
                    >
                      <Save className="h-3 w-3" />
                      Save
                    </Button>
                    {isDirty && (
                      <div className="flex h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse" title="Unsaved Changes" />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-background/40 p-1 rounded-lg border border-border/40">
                    <Button
                      variant={activationFilter === "all" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 text-[9px] px-2 font-black uppercase tracking-tighter"
                      onClick={() => setActivationFilter("all")}
                    >
                      All
                    </Button>
                    <Button
                      variant={activationFilter === "active" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 text-[9px] px-2 font-black uppercase tracking-tighter"
                      onClick={() => setActivationFilter("active")}
                    >
                      Active
                    </Button>
                    <Button
                      variant={activationFilter === "inactive" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 text-[9px] px-2 font-black uppercase tracking-tighter"
                      onClick={() => setActivationFilter("inactive")}
                    >
                      Inactive
                    </Button>
                  </div>

                  <div className="flex items-center gap-1 bg-background/40 p-1 rounded-lg border border-border/40">
                    <Button
                      variant={sourceFilter === "all" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 text-[9px] px-2 font-black uppercase tracking-tighter"
                      onClick={() => setSourceFilter("all")}
                    >
                      All Sources
                    </Button>
                    <Button
                      variant={sourceFilter === "local" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 text-[9px] px-2 font-black uppercase tracking-tighter"
                      onClick={() => setSourceFilter("local")}
                    >
                      Local
                    </Button>
                    <Button
                      variant={sourceFilter === "workshop" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 text-[9px] px-2 font-black uppercase tracking-tighter"
                      onClick={() => setSourceFilter("workshop")}
                    >
                      Workshop
                    </Button>
                  </div>
                </div>
              </div>

              {feedback && (
                <div 
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-4 py-2 text-[10px] font-black uppercase tracking-wider animate-in fade-in slide-in-from-top-2 duration-300",
                    feedback.tone === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" :
                    feedback.tone === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-700" :
                    "border-destructive/30 bg-destructive/10 text-destructive"
                  )}
                >
                  <div className={cn("h-1.5 w-1.5 rounded-full", 
                    feedback.tone === "success" ? "bg-emerald-500" : 
                    feedback.tone === "warning" ? "bg-amber-500" : "bg-destructive"
                  )} />
                  {feedback.message}
                </div>
              )}
            </div>
          </header>

          {/* Analysis Bar */}
          {analysis || isDirty ? (
            <div className="shrink-0 border-b border-border/60 bg-background/40 px-6 py-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-hidden">
                  {isDirty ? (
                    <Badge variant="outline" className="h-6 gap-2 border-amber-500/20 bg-amber-500/5 text-amber-700 text-[9px] font-black uppercase shrink-0">
                      <AlertTriangle className="h-3 w-3" />
                      Analysis Paused (Unsaved Draft)
                    </Badge>
                  ) : analysis ? (
                    <>
                      <Badge variant={analysis.isOptimal ? "outline" : "secondary"} className={cn(
                        "h-6 px-3 text-[9px] font-black uppercase shrink-0",
                        analysis.isOptimal ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600" : "bg-primary/10 text-primary"
                      )}>
                        {analysis.isOptimal ? "Order Optimal" : "Optimization Recommended"}
                      </Badge>
                      
                      {analysis.hasBlockingIssues && (
                        <Badge variant="destructive" className="h-6 px-2 text-[9px] font-black uppercase shrink-0">Blocking Issues</Badge>
                      )}
                      
                      {analysis.sortDifferenceCount > 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary/70 bg-primary/5 px-2 py-1 rounded border border-primary/10 shrink-0">
                          <ArrowUpDown className="h-3 w-3" />
                          <span>{analysis.sortDifferenceCount} Diffs</span>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {analysis && !isDirty && !analysis.hasBlockingIssues && analysis.sortDifferenceCount > 0 && (
                    <Button 
                      size="sm" 
                      className="h-6 px-3 text-[9px] font-black uppercase gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => void handleAutoSort()}
                      disabled={isBusy}
                    >
                      <Sparkles className="h-3 w-3" />
                      Apply Recommended Order
                    </Button>
                  )}
                  {(analysis?.missingInstalledInactiveDependencies.length ?? 0) > 0 && !isDirty && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-6 px-3 text-[9px] font-black uppercase gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                      onClick={() => void handleEnableMissingDependencies()}
                      disabled={isBusy}
                    >
                      <Link2 className="h-3 w-3" />
                      Auto-Enable {analysis?.missingInstalledInactiveDependencies.length ?? 0} Deps
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Mod Table Header */}
          <div className="shrink-0 sticky top-0 z-10 flex items-center px-6 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 bg-background border-b border-border/40">
            <div className="w-10 text-center">Active</div>
            <div className="w-8 mr-2 text-center">Ord</div>
            <div className="flex-1">Mod Specification</div>
            <div className="w-20 text-right">Version</div>
          </div>

          {/* Scrollable Mod List */}
          <div className="flex-1 overflow-y-auto no-scrollbar select-none">
            {filteredMods.length ? (
              filteredMods.map((mod, index) => {
                const isSelected = selectedMod?.id === mod.id;
                const packageId = mod.dependencyMetadata.packageIdNormalized;
                const activeIndex = packageId ? draftActivePackageIds.indexOf(packageId) : -1;

                return (
                  <div
                    key={mod.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedModId(mod.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedModId(mod.id);
                      }
                    }}
                    className={cn(
                      "group flex w-full items-center border-b border-border/10 px-6 py-1.5 text-left transition-all",
                      isSelected ? "bg-primary/10 ring-1 ring-inset ring-primary/20" : index % 2 === 0 ? "bg-transparent" : "bg-muted/5",
                      "hover:bg-primary/5"
                    )}
                  >
                    <div className="flex w-10 justify-center shrink-0">
                      <Checkbox
                        aria-label={`Toggle ${mod.name}`}
                        checked={mod.enabled}
                        disabled={!packageId || isBusy}
                        className="h-3.5 w-3.5"
                        onChange={() => {
                          if (packageId) toggleMod(packageId);
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>
                    
                    <div className="w-8 flex flex-col items-center justify-center shrink-0 mr-2">
                      {mod.enabled ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-3.5 w-3.5 p-0 hover:bg-primary/20 text-muted-foreground/40 hover:text-primary transition-opacity opacity-0 group-hover:opacity-100"
                            disabled={isBusy || activeIndex === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (packageId) moveActivePackageId(packageId, "up");
                            }}
                          >
                            <ArrowUp className="h-2.5 w-2.5" />
                          </Button>
                          <span className="text-[9px] font-black text-primary/80 leading-none py-0.5">
                            {activeIndex + 1}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-3.5 w-3.5 p-0 hover:bg-primary/20 text-muted-foreground/40 hover:text-primary transition-opacity opacity-0 group-hover:opacity-100"
                            disabled={isBusy || activeIndex === draftActivePackageIds.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (packageId) moveActivePackageId(packageId, "down");
                            }}
                          >
                            <ArrowDown className="h-2.5 w-2.5" />
                          </Button>
                        </>
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-border/40 bg-muted/10 opacity-20" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "truncate text-[11px] font-bold tracking-tight",
                          !mod.enabled ? "text-muted-foreground font-medium" : "text-foreground"
                        )}>
                          {mod.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {mod.isOfficial && (
                            <div className="bg-primary/10 text-primary text-[7px] font-black px-1 py-0 rounded uppercase ring-1 ring-inset ring-primary/20">Official</div>
                          )}
                          {!mod.hasAboutXml && (
                            <div className="bg-destructive/10 text-destructive text-[7px] font-black px-1 py-0 rounded uppercase ring-1 ring-inset ring-destructive/20">Invalid</div>
                          )}
                        </div>
                      </div>
                      <span className="truncate font-mono text-[8px] text-muted-foreground/50 tracking-tight">
                        {mod.packageId ?? mod.windowsPath}
                      </span>
                    </div>

                    <div className="w-24 text-right shrink-0 pr-2">
                      <Badge variant="outline" className={cn(
                        "h-4 text-[8px] px-1 font-bold uppercase ring-1 ring-inset",
                        mod.source === "installation" ? "bg-emerald-500/5 text-emerald-600/70 border-emerald-500/20" : "bg-blue-500/5 text-blue-600/70 border-blue-500/20"
                      )}>
                        {mod.source === "installation" ? "Local" : "Workshop"}
                      </Badge>
                    </div>

                    <div className="w-20 text-right text-[9px] font-black font-mono text-muted-foreground/60 shrink-0">
                      {mod.version ? `v${mod.version}` : "v?.?.?"}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex h-full items-center justify-center p-12 text-center">
                <div className="max-w-xs space-y-4 opacity-40">
                  <div className="relative mx-auto h-16 w-16">
                    <Package className="h-full w-full text-muted-foreground" />
                    <Search className="absolute -bottom-1 -right-1 h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-black uppercase tracking-[0.2em] rw-text">No Matches</p>
                    <p className="text-[10px] font-medium leading-relaxed">Adjust your filters or search query to find the mods you're looking for.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="shrink-0 flex justify-between items-center border-t border-border/60 bg-card/20 px-6 py-2.5">
            <div className="flex items-center gap-4 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-emerald-500" />
                <span>Scanner Active</span>
              </div>
              <span className="opacity-30">|</span>
              <span>Last Scan: {new Date(modLibrary.scannedAt).toLocaleTimeString()}</span>
            </div>
            <div className="text-[9px] font-black text-muted-foreground/40 bg-muted/10 px-2 py-0.5 rounded">
              {filteredMods.length} Visible
            </div>
          </footer>
        </section>

        {/* Resizer Handle */}
        <div 
          className="shrink-0 w-1 hover:w-1.5 h-full cursor-col-resize bg-border/40 hover:bg-primary/40 transition-all flex items-center justify-center z-20"
          onMouseDown={handleMouseDown}
        >
          <div className="w-[1px] h-16 bg-border/60" />
        </div>

        {/* Side Panel: Mod Information */}
        <aside 
          className="shrink-0 flex flex-col bg-card/10 overflow-hidden"
          style={{ width: `${asideWidth}%` }}
        >
          {selectedMod ? (
            <div className="flex flex-col h-full">
              <header className="shrink-0 border-b border-border/60 bg-background/40 p-8">
                <div className="flex flex-col gap-6">
                  <div className="flex items-start justify-between gap-6">
                    <div className="space-y-3 min-w-0">
                      <h3 className="text-3xl font-black uppercase tracking-tight rw-text leading-[1.1] text-foreground">
                        {selectedMod.name}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={selectedMod.enabled ? "default" : "outline"}
                          className={cn("h-5 text-[9px] font-black uppercase ring-1 ring-inset", 
                            selectedMod.enabled ? "bg-primary text-primary-foreground ring-primary/20" : "bg-muted/10 text-muted-foreground border-border/60 ring-black/5")}
                        >
                          {selectedMod.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant="outline" className="h-5 text-[9px] font-bold uppercase border-border/60 text-muted-foreground bg-muted/5">
                          {selectedMod.source}
                        </Badge>
                        {selectedMod.isOfficial && (
                          <div className="bg-primary/10 text-primary text-[9px] font-black px-2 py-0.5 rounded uppercase ring-1 ring-inset ring-primary/20">Official Core</div>
                        )}
                      </div>
                    </div>
                    {selectedMod.isOfficial && (
                      <div className="shrink-0 p-2.5 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm">
                        <ShieldCheck className="h-8 w-8" />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-border/40 bg-background/40 p-3.5 shadow-sm ring-1 ring-black/5">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">Identification</p>
                      <p className="font-mono text-[10px] font-bold truncate select-text" title={selectedMod.packageId ?? "N/A"}>
                        {selectedMod.packageId ?? "None"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-background/40 p-3.5 shadow-sm ring-1 ring-black/5">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-1.5">Distribution</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold truncate mr-2" title={selectedMod.author ?? "Unknown Author"}>
                          {selectedMod.author ?? "Unknown"}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/80 font-black">
                          v{selectedMod.version ?? "?.?"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-background/5">
                {analysis?.hasBlockingIssues && (
                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive/80 flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                      Critical Deployment Issues
                    </p>
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 ring-1 ring-destructive/10">
                      {analysis.missingUnavailableDependencies.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-black text-destructive uppercase tracking-wide">
                            Missing Runtime Dependencies:
                          </p>
                          <ul className="list-disc space-y-1.5 pl-5 text-[11px] font-medium leading-normal text-destructive/90 select-text">
                            {analysis.missingUnavailableDependencies.map((issue) => (
                              <li key={issue.packageId} className="marker:text-destructive/40">
                                <span className="font-mono font-black">{issue.packageId}</span> 
                                <span className="text-destructive/60 font-bold ml-1 italic">(Required by {issue.requiredByNames.join(", ")})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Module Description</p>
                  <div className="rounded-xl border border-border/40 bg-background/40 p-6 text-[12px] leading-relaxed text-foreground/80 select-text shadow-sm ring-1 ring-black/5">
                    <div className="prose prose-sm prose-invert max-w-none">
                      {renderDescriptionBlocks(selectedMod.description)}
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Execution Order Hints</p>
                  <div className="grid gap-4">
                    {[
                      { label: "Absolute Dependencies", items: selectedMod.dependencyMetadata.dependencies, color: "bg-blue-500" },
                      { label: "Initialize After", items: selectedMod.dependencyMetadata.loadAfter, color: "bg-emerald-500" },
                      { label: "Initialize Before", items: selectedMod.dependencyMetadata.loadBefore, color: "bg-amber-500" },
                      { label: "Incompatible Modules", items: selectedMod.dependencyMetadata.incompatibleWith, color: "bg-destructive" },
                    ].map(({ label, items, color }) => (
                      <div key={label} className="rounded-xl border border-border/40 bg-background/40 p-4 ring-1 ring-black/5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={cn("h-1.5 w-1.5 rounded-full shadow-[0_0_4px_rgba(0,0,0,0.2)]", color)} />
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                            {label}
                          </p>
                        </div>
                        {renderPackageList(items)}
                      </div>
                    ))}
                  </div>
                </section>

                {selectedExplanation?.reasons.length ? (
                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">Deployment Logic Analysis</p>
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 ring-1 ring-primary/10">
                      <ul className="space-y-2 text-[11px] font-medium leading-normal text-foreground/80 select-text">
                        {selectedExplanation.reasons.map((reason, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="text-primary font-black shrink-0">{i + 1}.</span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                ) : null}

                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Physical Environment</p>
                  <div className="rounded-xl border border-border/40 bg-background/40 p-5 space-y-4 font-mono text-[10px] ring-1 ring-black/5">
                    <div className="group/path">
                      <p className="text-[8px] font-black text-muted-foreground/40 uppercase mb-1.5 flex items-center gap-2">
                        <FolderSearch className="h-2.5 w-2.5" />
                        Host System Location
                      </p>
                      <p className="break-all text-muted-foreground/80 group-hover/path:text-foreground transition-colors select-text px-2 py-1.5 bg-background/20 rounded border border-border/20">
                        {selectedMod.windowsPath}
                      </p>
                    </div>
                    <div className="group/path">
                      <p className="text-[8px] font-black text-muted-foreground/40 uppercase mb-1.5 flex items-center gap-2">
                        <HardDrive className="h-2.5 w-2.5" />
                        Metadata Manifest
                      </p>
                      <p className="break-all text-muted-foreground/80 group-hover/path:text-foreground transition-colors select-text px-2 py-1.5 bg-background/20 rounded border border-border/20">
                        {selectedMod.manifestPath ?? "N/A"}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-12 text-center bg-background/5">
              <div className="space-y-6 max-w-xs animate-in fade-in zoom-in-95 duration-700">
                <div className="relative mx-auto h-24 w-24 opacity-10">
                  <Package className="h-full w-full text-muted-foreground" />
                  <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-black uppercase tracking-[0.3em] rw-text text-muted-foreground/40">
                    No Module Selected
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground/30 leading-relaxed uppercase tracking-widest">
                    Select a module from the repository to view its deployment specifications and dependency graph.
                  </p>
                </div>
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
        busy={applyActivePackageIdsMutation.isPending}
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
        busy={applyActivePackageIdsMutation.isPending}
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
