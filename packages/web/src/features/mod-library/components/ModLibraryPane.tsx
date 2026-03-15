import { ModLibraryDragSurface } from "@/features/mod-library/components/ModLibraryDragSurface";
import type { HomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

function ToolbarChip({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 items-center rounded-full border border-border/60 bg-background/80 px-2.5 text-[11px]",
        className,
      )}
    >
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span className="ml-1 text-[11px] font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

export function ModLibraryPane({
  controller,
}: {
  controller: HomePageController;
}) {
  const visibleCount =
    controller.visibleActiveMods.length + controller.visibleInactiveMods.length;

  if (!controller.modLibrary) {
    return null;
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border/60 bg-background/20">
      <h2 className="sr-only">Mod Library</h2>

      <header className="shrink-0 border-b border-border/60 bg-card/40 px-5 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarChip
              label="Active"
              value={String(controller.draftActivePackageIds.length)}
            />
            <ToolbarChip
              label="Inactive"
              value={String(controller.inactiveMods.length)}
            />
            <ToolbarChip label="Visible" value={String(visibleCount)} />
            <ToolbarChip
              label="Total"
              value={String(controller.modLibrary.mods.length)}
            />
            {controller.isDirty ? (
              <Badge
                variant="outline"
                className="h-7 border-amber-500/40 bg-amber-500/10 text-amber-700"
                title="Unsaved Changes"
              >
                Unsaved changes
              </Badge>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/60 bg-background/85 px-3 py-2.5 shadow-sm">
            <button
              type="button"
              aria-expanded={controller.isProfilePanelOpen}
              aria-label="Toggle Active Profile Panel"
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() =>
                controller.setIsProfilePanelOpen((current) => !current)
              }
            >
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Active Profile
                </p>
                <span className="truncate text-sm font-semibold text-foreground">
                  {controller.currentProfile?.name ?? "No profile selected"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Active column order is the exact RimWorld load order.
                </span>
              </div>

              <span className="shrink-0 rounded-full border border-border/60 bg-background/90 p-1 text-muted-foreground">
                {controller.isProfilePanelOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </span>
            </button>

            {controller.isProfilePanelOpen ? (
              <>
                <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border/50 pt-2">
                  <label className="min-w-[150px] flex-1">
                    <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Profile Selection
                    </span>
                    <select
                      aria-label="Profile Selection"
                      className="mt-1 h-8 w-full rounded-lg border border-border/60 bg-background px-3 text-sm font-medium text-foreground outline-none"
                      disabled={
                        controller.isBusy || !controller.currentProfileId
                      }
                      value={controller.currentProfileId ?? ""}
                      onChange={(event) =>
                        void controller.handleProfileSwitch(event.target.value)
                      }
                    >
                      {controller.profileCatalogQuery.data?.profiles.map(
                        (profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <div className="min-w-[200px] flex-[1.4]">
                    <label
                      htmlFor="profile-name-input"
                      className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                    >
                      Profile Name
                    </label>
                    <Input
                      id="profile-name-input"
                      aria-label="Profile Name"
                      className="mt-1 h-8 border-border/60 bg-background text-sm font-medium"
                      disabled={controller.isBusy || !controller.currentProfile}
                      value={controller.draftProfileName}
                      onChange={(event) => {
                        controller.setFeedback(null);
                        controller.setDraftProfileName(event.target.value);
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-2 px-3"
                      title="New Profile"
                      onClick={controller.handleOpenCreateProfileDialog}
                    >
                      <Plus className="h-4 w-4" />
                      New Profile
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-2 px-3"
                      title="Delete Profile"
                      onClick={controller.handleOpenDeleteProfileDialog}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-2 px-3"
                      disabled={
                        controller.isBusy ||
                        !controller.currentProfile ||
                        !controller.isDirty
                      }
                      onClick={() => void controller.handleSaveProfile()}
                    >
                      <Save className="h-4 w-4" />
                      Save
                    </Button>
                  </div>
                </div>

                <div className="mt-2 rounded-lg border border-border/50 bg-background/70 px-3 py-2.5">
                  <button
                    type="button"
                    aria-expanded={controller.isFilterPanelOpen}
                    aria-label="Toggle Filters Panel"
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() =>
                      controller.setIsFilterPanelOpen((current) => !current)
                    }
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Filters
                      </p>
                      <span className="text-xs text-muted-foreground">
                        Source:
                      </span>
                      <span className="text-xs font-medium capitalize text-foreground">
                        {controller.sourceFilter === "all"
                          ? "all sources"
                          : controller.sourceFilter}
                      </span>
                    </div>

                    <span className="shrink-0 rounded-full border border-border/60 bg-background/90 p-1 text-muted-foreground">
                      {controller.isFilterPanelOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                  </button>

                  {controller.isFilterPanelOpen ? (
                    <div className="mt-2 border-t border-border/50 pt-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={
                            controller.sourceFilter === "all"
                              ? "secondary"
                              : "outline"
                          }
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => controller.setSourceFilter("all")}
                        >
                          All Sources
                        </Button>
                        <Button
                          variant={
                            controller.sourceFilter === "local"
                              ? "secondary"
                              : "outline"
                          }
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => controller.setSourceFilter("local")}
                        >
                          Local
                        </Button>
                        <Button
                          variant={
                            controller.sourceFilter === "workshop"
                              ? "secondary"
                              : "outline"
                          }
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() =>
                            controller.setSourceFilter("workshop")
                          }
                        >
                          Workshop
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          {controller.feedback ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm",
                controller.feedback.tone === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : controller.feedback.tone === "warning"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  controller.feedback.tone === "success"
                    ? "bg-emerald-500"
                    : controller.feedback.tone === "warning"
                      ? "bg-amber-500"
                      : "bg-destructive",
                )}
              />
              <span className="font-medium">{controller.feedback.message}</span>
            </div>
          ) : null}
        </div>
      </header>

      {controller.analysis || controller.isDirty ? (
        <div className="shrink-0 border-b border-border/60 bg-background/50 px-5 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-hidden">
              {controller.isDirty ? (
                <Badge
                  variant="outline"
                  className="h-7 gap-2 border-amber-500/30 bg-amber-500/10 text-amber-700"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Analysis Paused (Unsaved Draft)
                </Badge>
              ) : controller.analysis ? (
                <>
                  <Badge
                    variant={
                      controller.analysis.isOptimal ? "outline" : "secondary"
                    }
                    className={cn(
                      "h-7 px-3",
                      controller.analysis.isOptimal
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {controller.analysis.isOptimal
                      ? "Order Optimal"
                      : "Optimization Recommended"}
                  </Badge>

                  {controller.analysis.hasBlockingIssues ? (
                    <Badge variant="destructive" className="h-7 px-3">
                      Blocking Issues
                    </Badge>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {controller.analysis &&
              !controller.isDirty &&
              !controller.analysis.hasBlockingIssues &&
              controller.analysis.sortDifferenceCount > 0 ? (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 px-3 text-xs"
                  onClick={() => void controller.handleAutoSort()}
                  disabled={controller.isBusy}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Apply Recommended Order
                </Button>
              ) : null}
              {(controller.analysis?.missingInstalledInactiveDependencies
                .length ?? 0) > 0 && !controller.isDirty ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 px-3 text-xs"
                  onClick={() =>
                    void controller.handleEnableMissingDependencies()
                  }
                  disabled={controller.isBusy}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Auto-Enable{" "}
                  {controller.analysis?.missingInstalledInactiveDependencies
                    .length ?? 0}{" "}
                  Deps
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-b border-border/60 bg-background/95 px-5 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              placeholder="Search by name, author, or package id"
              className="h-9 w-full border-border/60 bg-background pl-9 text-sm"
              value={controller.searchQuery}
              onChange={(event) =>
                controller.setSearchQuery(event.target.value)
              }
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 px-3 text-sm"
            disabled={
              controller.isBusy ||
              controller.isRescanning ||
              controller.isDirty ||
              !controller.currentProfileId
            }
            onClick={() => void controller.handleRescanLibrary()}
          >
            {controller.isRescanning ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Rescan
          </Button>
        </div>
      </div>

      <div className="shrink-0 border-b border-border/40 bg-background/90 px-5 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
            <GripVertical className="h-3.5 w-3.5" />
            Drag between columns to enable or disable mods
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
            Active column order is the exact saved load order
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
            Inactive order is session-only
          </div>
        </div>
      </div>

      <ModLibraryDragSurface controller={controller} />

      <footer className="flex shrink-0 flex-wrap justify-between gap-3 border-t border-border/60 bg-card/20 px-5 py-2">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-1 rounded-full bg-emerald-500" />
            <span>Scanner Active</span>
          </div>
          <span className="opacity-30">|</span>
          <span>
            Last Scan:{" "}
            {new Date(controller.modLibrary.scannedAt).toLocaleTimeString()}
          </span>
        </div>
        <div className="rounded-full bg-muted/20 px-3 py-1 text-xs font-medium text-muted-foreground">
          {visibleCount} Visible
        </div>
      </footer>
    </section>
  );
}
