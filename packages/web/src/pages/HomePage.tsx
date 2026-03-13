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
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

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
  const [dismissedDependencyAnalysisAt, setDismissedDependencyAnalysisAt] =
    useState<string | null>(null);
  const [dismissedSortAnalysisAt, setDismissedSortAnalysisAt] = useState<
    string | null
  >(null);

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
  const term = searchQuery.trim().toLowerCase();
  const filteredMods = mods.filter((mod) => {
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

    const requestedName = window.prompt(
      "New profile name",
      `Copy of ${currentProfile.name}`,
    );
    const name = requestedName?.trim();

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

    const shouldDelete = window.confirm(
      isDirty
        ? `Delete ${currentProfile.name}? Unsaved changes in this profile will be discarded.`
        : `Delete ${currentProfile.name}?`,
    );

    if (!shouldDelete) {
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

        <section className="flex w-[56%] min-w-0 flex-col border-r border-border/60">
          <div className="border-b border-border/40 bg-card/10 px-6 py-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                    Profile-Backed Mod Scan
                  </p>
                  <h2 className="text-3xl font-black uppercase tracking-tight rw-text">
                    Mod Library
                  </h2>
                  <p className="text-sm font-medium text-muted-foreground">
                    {modLibrary.mods.length} mods loaded from configured
                    installation and workshop roots.
                  </p>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Filter Mods..."
                    className="w-72 pl-10 font-bold"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.3fr_minmax(0,1fr)_auto]">
                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                    Active Profile
                  </p>
                  <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center">
                    <select
                      aria-label="Profile"
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-bold"
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
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={isBusy || !currentProfileId}
                      onClick={() => void handleCreateProfile()}
                    >
                      <Package className="h-4 w-4" />
                      New Profile
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      disabled={isBusy || !currentProfileId}
                      onClick={() => void handleDeleteProfile()}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                    Profile Name
                  </p>
                  <Input
                    aria-label="Profile Name"
                    className="mt-3 font-bold"
                    disabled={isBusy || !currentProfile}
                    value={draftProfileName}
                    onChange={(event) => {
                      setFeedback(null);
                      setDraftProfileName(event.target.value);
                    }}
                  />
                </div>

                <div className="flex flex-col justify-end gap-3">
                  <Button
                    className="gap-2"
                    disabled={isBusy || !currentProfile || !isDirty}
                    onClick={() => void handleSaveProfile()}
                  >
                    <Save className="h-4 w-4" />
                    Save Profile
                  </Button>
                  {isDirty ? (
                    <Badge variant="secondary" className="justify-center">
                      Unsaved Changes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="justify-center">
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
                      ? "rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-primary"
                      : feedback.tone === "warning"
                        ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700"
                        : "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive"
                  }
                >
                  {feedback.message}
                </output>
              ) : null}

              {isDirty ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700">
                  This draft differs from the saved profile. Save the profile
                  before re-running dependency fixes or automatic sorting.
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-b border-border/40 bg-background/30 px-6 py-5 xl:grid-cols-4">
            <Card className="border-border/60 bg-card/60">
              <CardContent className="p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Status
                </p>
                <p className="mt-2 text-sm font-black uppercase tracking-wide">
                  {isDirty
                    ? "Unsaved Draft"
                    : analysis
                      ? analysis.isOptimal
                        ? "Optimal"
                        : "Needs Action"
                      : analysisQuery.isPending
                        ? "Analyzing"
                        : "Unavailable"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/60">
              <CardContent className="p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Missing Dependencies
                </p>
                <p className="mt-2 text-sm font-black">
                  {analysis
                    ? analysis.missingUnavailableDependencies.length
                    : isDirty
                      ? "Save First"
                      : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/60">
              <CardContent className="p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Auto-Enable Candidates
                </p>
                <p className="mt-2 text-sm font-black">
                  {analysis
                    ? analysis.missingInstalledInactiveDependencies.length
                    : isDirty
                      ? "Save First"
                      : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/60">
              <CardContent className="p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Sort Differences
                </p>
                <p className="mt-2 text-sm font-black">
                  {analysis
                    ? analysis.sortDifferenceCount
                    : isDirty
                      ? "Save First"
                      : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {analysis ? (
            <div className="border-b border-border/40 bg-card/10 px-6 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={analysis.isOptimal ? "default" : "secondary"}>
                  {analysis.isOptimal
                    ? "Optimal Load Order"
                    : "Review Recommended"}
                </Badge>
                {analysis.hasBlockingIssues ? (
                  <Badge variant="destructive">Blocking Issues</Badge>
                ) : null}
                {analysis.sortDifferenceCount > 0 ? (
                  <Badge variant="outline" className="gap-1">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    Reorder Suggested
                  </Badge>
                ) : null}
                {analysis.missingInstalledInactiveDependencies.length > 0 ? (
                  <Badge variant="outline" className="gap-1">
                    <Link2 className="h-3.5 w-3.5" />
                    Missing Installed Dependencies
                  </Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  Last analysis:{" "}
                  {new Date(analysis.analyzedAt).toLocaleString()}
                </span>
              </div>
            </div>
          ) : analysisQuery.isError ? (
            <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-4 text-sm font-bold text-destructive">
              Failed to analyze mod order. Try saving the profile and reloading
              the page.
            </div>
          ) : isDirty ? (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-4 text-sm font-bold text-amber-700">
              Analysis is paused while this profile has unsaved changes.
            </div>
          ) : null}

          <div className="flex items-center px-6 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <div className="w-12 text-center">Use</div>
            <div className="flex-1">Mod</div>
            <div className="w-28 text-center">Source</div>
            <div className="w-24 text-right">Version</div>
          </div>

          <div className="flex-1 overflow-y-auto border-y border-border/30">
            {filteredMods.length ? (
              filteredMods.map((mod) => {
                const isSelected = selectedMod?.id === mod.id;
                const packageId = mod.dependencyMetadata.packageIdNormalized;

                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedModId(mod.id)}
                    className={cn(
                      "flex w-full items-center border-b border-border/20 px-6 py-4 text-left transition-colors",
                      isSelected ? "bg-accent/40" : "hover:bg-muted/30",
                    )}
                  >
                    <div className="flex w-12 justify-center">
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
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold">
                          {mod.name}
                        </span>
                        <Badge variant={mod.enabled ? "default" : "outline"}>
                          {mod.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        {mod.isOfficial ? (
                          <Badge variant="secondary">Official</Badge>
                        ) : null}
                        {!mod.hasAboutXml ? (
                          <Badge variant="destructive">Missing About.xml</Badge>
                        ) : null}
                      </div>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {mod.packageId ?? mod.windowsPath}
                      </p>
                    </div>
                    <div className="w-28 text-center">
                      <Badge variant="outline" className="uppercase">
                        {mod.source}
                      </Badge>
                    </div>
                    <div className="w-24 text-right text-xs font-bold text-muted-foreground">
                      {mod.version ?? "Unknown"}
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
                    Adjust the filter or rescan after changing paths.
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

        <aside className="flex w-[44%] min-w-0 flex-col bg-card/10">
          <div className="border-b border-border/40 bg-background/30 p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                  Active Load Order
                </p>
                <h3 className="mt-2 text-2xl font-black uppercase tracking-wide rw-text">
                  {draftProfileName.trim() || currentProfile?.name || "Profile"}
                </h3>
              </div>
              <Badge variant={isDirty ? "secondary" : "outline"}>
                {draftActivePackageIds.length} Active
              </Badge>
            </div>

            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {activeEntries.length ? (
                activeEntries.map((entry, index) => (
                  <div
                    key={entry.packageId}
                    className="rounded-lg border border-border/60 bg-background/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold">
                          {index + 1}. {entry.modName}
                        </p>
                        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                          {entry.packageId}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.source ? (
                            <Badge variant="outline" className="uppercase">
                              {entry.source}
                            </Badge>
                          ) : null}
                          {entry.isOfficial ? (
                            <Badge variant="secondary">Official</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy || index === 0}
                          onClick={() =>
                            moveActivePackageId(entry.packageId, "top")
                          }
                        >
                          Top
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            isBusy || index === activeEntries.length - 1
                          }
                          onClick={() =>
                            moveActivePackageId(entry.packageId, "bottom")
                          }
                        >
                          Bottom
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={isBusy || index === 0}
                          onClick={() =>
                            moveActivePackageId(entry.packageId, "up")
                          }
                        >
                          <ArrowUp className="h-4 w-4" />
                          Up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={
                            isBusy || index === activeEntries.length - 1
                          }
                          onClick={() =>
                            moveActivePackageId(entry.packageId, "down")
                          }
                        >
                          <ArrowDown className="h-4 w-4" />
                          Down
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="col-span-2"
                          disabled={isBusy}
                          onClick={() => toggleMod(entry.packageId)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border/60 bg-background/40 p-6 text-center text-sm text-muted-foreground">
                  No mods are active in this draft profile yet.
                </div>
              )}
            </div>
          </div>

          {selectedMod ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border/40 bg-background/30 p-8">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <h3 className="text-3xl font-black uppercase tracking-wide rw-text leading-tight">
                      {selectedMod.name}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={selectedMod.enabled ? "default" : "outline"}
                      >
                        {selectedMod.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge variant="outline" className="uppercase">
                        {selectedMod.source}
                      </Badge>
                      {selectedMod.isOfficial ? (
                        <Badge variant="secondary">Official</Badge>
                      ) : null}
                      {!selectedMod.hasAboutXml ? (
                        <Badge variant="destructive">Metadata Missing</Badge>
                      ) : null}
                    </div>
                  </div>
                  {selectedMod.isOfficial ? (
                    <ShieldCheck className="h-8 w-8 text-primary" />
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="bg-background/30">
                    <CardContent className="p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Package ID
                      </p>
                      <p className="mt-2 break-all font-mono text-xs">
                        {selectedMod.packageId ?? "Not available"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-background/30">
                    <CardContent className="p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Author / Version
                      </p>
                      <p className="mt-2 text-sm font-bold">
                        {selectedMod.author ?? "Unknown author"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Version: {selectedMod.version ?? "Unknown"}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto p-8">
                {analysis?.hasBlockingIssues ? (
                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Blocking Diagnostics
                    </p>
                    <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
                      {analysis.missingUnavailableDependencies.length > 0 ? (
                        <div>
                          <p className="text-sm font-bold text-destructive">
                            Some required mods are not installed, so automatic
                            sorting is paused.
                          </p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive/90">
                            {analysis.missingUnavailableDependencies.map(
                              (issue) => (
                                <li key={issue.packageId}>
                                  {issue.packageId} required by{" "}
                                  {issue.requiredByNames.join(", ")}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      ) : null}
                      {analysis.diagnostics
                        .filter(
                          (diagnostic) =>
                            diagnostic.isBlocking &&
                            diagnostic.code !==
                              "missing_unavailable_dependency",
                        )
                        .map((diagnostic) => (
                          <p
                            key={`${diagnostic.code}:${diagnostic.message}`}
                            className="text-sm font-bold text-destructive"
                          >
                            {diagnostic.message}
                          </p>
                        ))}
                    </div>
                  </section>
                ) : null}

                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Description
                  </p>
                  <div className="space-y-3 rounded-lg border border-border/60 bg-background/60 p-4">
                    {renderDescriptionBlocks(selectedMod.description)}
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Dependency Hints
                  </p>
                  <div className="space-y-4 rounded-lg border border-border/60 bg-background/60 p-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Dependencies
                      </p>
                      <div className="mt-2">
                        {renderPackageList(
                          selectedMod.dependencyMetadata.dependencies,
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Load After
                      </p>
                      <div className="mt-2">
                        {renderPackageList(
                          selectedMod.dependencyMetadata.loadAfter,
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Load Before
                      </p>
                      <div className="mt-2">
                        {renderPackageList(
                          selectedMod.dependencyMetadata.loadBefore,
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Incompatible With
                      </p>
                      <div className="mt-2">
                        {renderPackageList(
                          selectedMod.dependencyMetadata.incompatibleWith,
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {selectedExplanation?.reasons.length ? (
                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Order Analysis
                    </p>
                    <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                        {selectedExplanation.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                ) : null}

                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Mod Path
                  </p>
                  <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                    <p className="break-all font-mono text-xs">
                      {selectedMod.windowsPath}
                    </p>
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    About.xml
                  </p>
                  <div className="rounded-lg border border-border/60 bg-background/60 p-4 text-sm">
                    <p>
                      Manifest path: {formatPathValue(selectedMod.manifestPath)}
                    </p>
                    <p className="mt-2">
                      WSL path: {formatPathValue(selectedMod.wslPath)}
                    </p>
                  </div>
                </section>

                {selectedMod.notes.length ? (
                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Notes
                    </p>
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                      <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                        {selectedMod.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                ) : null}

                {modLibrary.errors.length ? (
                  <section className="space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Scan Warnings
                    </p>
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
                  </section>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-12 text-center">
              <div className="space-y-3">
                <Package className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="text-lg font-black uppercase tracking-[0.2em] rw-text">
                  No Mod Selected
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

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
