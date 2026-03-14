import type { HomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Link2,
  LoaderCircle,
  Package,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

function ToolbarChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span className="ml-1.5 text-[11px] font-semibold text-foreground">
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
  if (!controller.modLibrary) {
    return null;
  }

  return (
    <section className="flex min-w-0 flex-col border-r border-border/60 bg-background/20">
      <h2 className="sr-only">Mod Library</h2>

      <header className="shrink-0 border-b border-border/60 bg-card/40 px-6 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarChip
              label="Active"
              value={String(controller.draftActivePackageIds.length)}
            />
            <ToolbarChip
              label="Visible"
              value={String(controller.filteredMods.length)}
            />
            <ToolbarChip
              label="Total"
              value={String(controller.modLibrary.mods.length)}
            />
            {controller.isDirty ? (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-700"
                title="Unsaved Changes"
              >
                Unsaved changes
              </Badge>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/60 bg-background/85 px-4 py-3 shadow-sm">
            <button
              type="button"
              aria-expanded={controller.isProfilePanelOpen}
              aria-label="Toggle Active Profile Panel"
              className="flex w-full items-center justify-between gap-4 text-left"
              onClick={() =>
                controller.setIsProfilePanelOpen((current) => !current)
              }
            >
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Active Profile
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold text-foreground">
                    {controller.currentProfile?.name ?? "No profile selected"}
                  </span>
                  <span className="text-muted-foreground">
                    Manage profile selection, naming, and save actions.
                  </span>
                </div>
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
                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border/50 pt-3">
                  <label className="min-w-[150px] flex-1 space-y-1.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Profile Selection
                    </span>
                    <select
                      aria-label="Profile Selection"
                      className="h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-sm font-medium text-foreground outline-none"
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

                  <div className="min-w-[200px] flex-[1.4] space-y-1.5">
                    <label
                      htmlFor="profile-name-input"
                      className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                    >
                      Profile Name
                    </label>
                    <Input
                      id="profile-name-input"
                      aria-label="Profile Name"
                      className="h-9 border-border/60 bg-background text-sm font-medium"
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
                      className="h-9 gap-2 px-3"
                      title="New Profile"
                      onClick={controller.handleOpenCreateProfileDialog}
                    >
                      <Plus className="h-4 w-4" />
                      New Profile
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2 px-3"
                      title="Delete Profile"
                      onClick={controller.handleOpenDeleteProfileDialog}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 gap-2 px-3"
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

                <div className="mt-3 rounded-lg border border-border/50 bg-background/70 px-3 py-3">
                  <button
                    type="button"
                    aria-expanded={controller.isFilterPanelOpen}
                    aria-label="Toggle Filters Panel"
                    className="flex w-full items-center justify-between gap-4 text-left"
                    onClick={() =>
                      controller.setIsFilterPanelOpen((current) => !current)
                    }
                  >
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Filters
                      </p>
                      <p className="text-xs text-muted-foreground sm:text-sm">
                        Activation:{" "}
                        <span className="font-medium capitalize text-foreground">
                          {controller.activationFilter}
                        </span>
                        <span className="mx-2 text-border">/</span>
                        Source:{" "}
                        <span className="font-medium capitalize text-foreground">
                          {controller.sourceFilter === "all"
                            ? "all sources"
                            : controller.sourceFilter}
                        </span>
                      </p>
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
                    <div className="mt-3 grid gap-3 border-t border-border/50 pt-3 lg:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Activation
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={
                              controller.activationFilter === "all"
                                ? "secondary"
                                : "outline"
                            }
                            size="sm"
                            className="h-9 px-4"
                            onClick={() =>
                              controller.setActivationFilter("all")
                            }
                          >
                            All
                          </Button>
                          <Button
                            variant={
                              controller.activationFilter === "active"
                                ? "secondary"
                                : "outline"
                            }
                            size="sm"
                            className="h-9 px-4"
                            onClick={() =>
                              controller.setActivationFilter("active")
                            }
                          >
                            Active
                          </Button>
                          <Button
                            variant={
                              controller.activationFilter === "inactive"
                                ? "secondary"
                                : "outline"
                            }
                            size="sm"
                            className="h-9 px-4"
                            onClick={() =>
                              controller.setActivationFilter("inactive")
                            }
                          >
                            Inactive
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Source
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={
                              controller.sourceFilter === "all"
                                ? "secondary"
                                : "outline"
                            }
                            size="sm"
                            className="h-9 px-4"
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
                            className="h-9 px-4"
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
                            className="h-9 px-4"
                            onClick={() =>
                              controller.setSourceFilter("workshop")
                            }
                          >
                            Workshop
                          </Button>
                        </div>
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
                "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm",
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
        <div className="shrink-0 border-b border-border/60 bg-background/50 px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
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

                  {controller.analysis.sortDifferenceCount > 0 ? (
                    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary/80">
                      <ArrowUpDown className="h-3.5 w-3.5" />
                      <span>
                        {controller.analysis.sortDifferenceCount} Diffs
                      </span>
                    </div>
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

      <div className="shrink-0 border-b border-border/60 bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              placeholder="Search by name, author, or package id"
              className="h-10 w-full border-border/60 bg-background pl-9 text-sm"
              value={controller.searchQuery}
              onChange={(event) =>
                controller.setSearchQuery(event.target.value)
              }
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-2 px-4 text-sm"
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

      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-4 border-b border-border/40 bg-background/95 px-6 py-3 text-xs font-medium text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="w-11 text-center">Active</div>
        <div className="w-12 text-center">Order</div>
        <div className="flex-1">Mod</div>
      </div>

      <div className="no-scrollbar flex-1 select-none overflow-y-auto">
        {controller.filteredMods.length ? (
          controller.filteredMods.map((mod, index) => {
            const isSelected = controller.selectedMod?.id === mod.id;
            const packageId = mod.dependencyMetadata.packageIdNormalized;
            const activeIndex = packageId
              ? controller.draftActivePackageIds.indexOf(packageId)
              : -1;

            return (
              <div
                key={mod.id}
                className={cn(
                  "group flex w-full items-start gap-3 border-b border-border/10 px-6 py-3 text-left transition-all",
                  isSelected
                    ? "bg-primary/10 ring-1 ring-inset ring-primary/20"
                    : index % 2 === 0
                      ? "bg-transparent"
                      : "bg-muted/5",
                  "hover:bg-primary/5",
                )}
              >
                <div className="flex w-11 shrink-0 justify-center pt-1">
                  <Checkbox
                    aria-label={`Toggle ${mod.name}`}
                    checked={mod.enabled}
                    disabled={!packageId || controller.isBusy}
                    className="h-4 w-4"
                    onChange={() => {
                      if (packageId) {
                        controller.toggleMod(packageId);
                      }
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>

                <div className="flex w-12 shrink-0 flex-col items-center justify-center">
                  {mod.enabled ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-muted-foreground/50 transition-opacity hover:bg-primary/20 hover:text-primary md:opacity-0 md:group-hover:opacity-100"
                        disabled={controller.isBusy || activeIndex === 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (packageId) {
                            controller.moveActivePackageId(packageId, "up");
                          }
                        }}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <span className="py-1 text-xs font-semibold leading-none text-primary/80">
                        {activeIndex + 1}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 text-muted-foreground/50 transition-opacity hover:bg-primary/20 hover:text-primary md:opacity-0 md:group-hover:opacity-100"
                        disabled={
                          controller.isBusy ||
                          activeIndex ===
                            controller.draftActivePackageIds.length - 1
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          if (packageId) {
                            controller.moveActivePackageId(packageId, "down");
                          }
                        }}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <div className="h-5 w-5 rounded-full border border-border/40 bg-muted/10 opacity-30" />
                  )}
                </div>

                <button
                  type="button"
                  className="min-w-0 flex-1 space-y-1.5 text-left"
                  onClick={() => controller.setSelectedModId(mod.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-sm font-semibold tracking-tight",
                        !mod.enabled
                          ? "font-medium text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {mod.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      {mod.isOfficial ? (
                        <div className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20">
                          Official
                        </div>
                      ) : null}
                      {!mod.hasAboutXml ? (
                        <div className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-inset ring-destructive/20">
                          Invalid
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <span className="truncate font-mono text-[11px] text-muted-foreground/80">
                    {mod.packageId ?? mod.windowsPath}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-6 rounded-full px-2 font-medium",
                        mod.source === "installation"
                          ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                          : "border-blue-500/30 bg-blue-500/5 text-blue-700",
                      )}
                    >
                      {mod.source === "installation" ? "Local" : "Workshop"}
                    </Badge>
                    <span className="font-mono text-[11px]">
                      {mod.version
                        ? `Version ${mod.version}`
                        : "Version unknown"}
                    </span>
                  </div>
                </button>
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
                <p className="text-sm font-semibold text-foreground">
                  No matches
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Adjust your filters or search query to find the mods
                  you&apos;re looking for.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap justify-between gap-3 border-t border-border/60 bg-card/20 px-6 py-3">
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
          {controller.filteredMods.length} Visible
        </div>
      </footer>
    </section>
  );
}
