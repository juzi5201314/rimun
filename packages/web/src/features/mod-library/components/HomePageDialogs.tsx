import type { HomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { AlertDialog } from "@/shared/components/ui/alert-dialog";
import { Input } from "@/shared/components/ui/input";
import { Sparkles } from "lucide-react";
import type { Blocker } from "react-router-dom";

export function HomePageDialogs({
  controller,
  routeBlocker,
}: {
  controller: HomePageController;
  routeBlocker: Blocker;
}) {
  return (
    <>
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
        open={controller.isCreateProfileDialogOpen}
        title="Create New Profile"
        description="Create a new profile from the current saved snapshot."
        confirmLabel="Create Profile"
        cancelLabel="Cancel"
        tone="default"
        busy={
          controller.createProfileMutation.isPending ||
          controller.switchProfileMutation.isPending ||
          controller.saveProfileMutation.isPending
        }
        confirmDisabled={!controller.newProfileName.trim()}
        onConfirm={() => void controller.handleCreateProfile()}
        onCancel={() => {
          if (
            controller.createProfileMutation.isPending ||
            controller.switchProfileMutation.isPending ||
            controller.saveProfileMutation.isPending
          ) {
            return;
          }

          controller.setIsCreateProfileDialogOpen(false);
          controller.setNewProfileName("");
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
            value={controller.newProfileName}
            onChange={(event) =>
              controller.setNewProfileName(event.target.value)
            }
            placeholder="Combat Run"
            onKeyDown={(event) => {
              if (event.key === "Enter" && controller.newProfileName.trim()) {
                event.preventDefault();
                void controller.handleCreateProfile();
              }
            }}
          />
          {controller.isDirty ? (
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
        open={controller.isDeleteProfileDialogOpen}
        title="Delete Selected Profile?"
        description="Delete the selected profile and switch to the backend-provided fallback profile."
        confirmLabel="Delete Profile"
        cancelLabel="Keep Profile"
        tone="danger"
        busy={controller.deleteProfileMutation.isPending}
        onConfirm={() => void controller.handleDeleteProfile()}
        onCancel={() => {
          if (controller.deleteProfileMutation.isPending) {
            return;
          }

          controller.setIsDeleteProfileDialogOpen(false);
        }}
      >
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-bold text-foreground">
              {controller.currentProfile?.name ?? "Current profile"}
            </span>{" "}
            will be removed from the catalog.
          </p>
          {controller.isDirty ? (
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
        open={controller.isDependencyDialogOpen}
        title="Enable Missing Dependencies?"
        description="Some active mods are missing required dependencies that are already installed in your library."
        confirmLabel="Enable Dependencies"
        cancelLabel="Keep Current State"
        tone="warning"
        busy={controller.applyActivePackageIdsMutation.isPending}
        onConfirm={() => void controller.handleEnableMissingDependencies()}
        onCancel={() => {
          controller.setIsDependencyDialogOpen(false);
          if (controller.analysis) {
            controller.setDismissedDependencyAnalysisAt(
              controller.analysis.analyzedAt,
            );
          }
          controller.setFeedback({
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
              {controller.analysis?.missingInstalledInactiveDependencies.map(
                (issue) => (
                  <li key={issue.packageId}>
                    {issue.modName ?? issue.packageId} required by{" "}
                    {issue.requiredByNames.join(", ")}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </AlertDialog>

      <AlertDialog
        open={controller.isSortDialogOpen}
        title="Apply Recommended Sort Order?"
        description="The current active mod order is not the recommended load order. Rimun can update the current profile and rewrite ModsConfig.xml with the suggested sequence."
        confirmLabel="Auto Sort"
        cancelLabel="Keep Current Order"
        tone="default"
        busy={controller.applyActivePackageIdsMutation.isPending}
        onConfirm={() => void controller.handleAutoSort()}
        onCancel={() => {
          controller.setIsSortDialogOpen(false);
          if (controller.analysis) {
            controller.setDismissedSortAnalysisAt(
              controller.analysis.analyzedAt,
            );
          }
          controller.setFeedback({
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
              {controller.analysis?.recommendedOrderPackageIds.map(
                (packageId, index) => (
                  <li key={packageId} className="font-mono">
                    {index + 1}. {packageId}
                  </li>
                ),
              )}
            </ol>
          </div>
        </div>
      </AlertDialog>
    </>
  );
}
