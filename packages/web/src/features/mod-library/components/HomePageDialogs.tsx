import type { HomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { AlertDialog } from "@/shared/components/ui/alert-dialog";
import { Input } from "@/shared/components/ui/input";
import { useI18n } from "@/shared/i18n";
import { Sparkles } from "lucide-react";
import type { Blocker } from "react-router-dom";

export function HomePageDialogs({
  controller,
  routeBlocker,
}: {
  controller: HomePageController;
  routeBlocker: Blocker;
}) {
  const { t } = useI18n();
  const currentOrderViolationCount = controller.currentOrderViolations.length;

  return (
    <>
      <AlertDialog
        open={routeBlocker.state === "blocked"}
        title={t("mod_library_dialogs.discard_title")}
        description={t("mod_library_dialogs.discard_description")}
        confirmLabel={t("mod_library_dialogs.discard_confirm")}
        cancelLabel={t("mod_library_dialogs.discard_cancel")}
        tone="warning"
        onConfirm={() => routeBlocker.proceed?.()}
        onCancel={() => routeBlocker.reset?.()}
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>{t("mod_library_dialogs.discard_body")}</p>
        </div>
      </AlertDialog>

      <AlertDialog
        open={controller.isCreateProfileDialogOpen}
        title={t("mod_library_dialogs.create_title")}
        description={t("mod_library_dialogs.create_description")}
        confirmLabel={t("mod_library_dialogs.create_confirm")}
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
            {t("mod_library_dialogs.profile_name_label")}
          </label>
          <Input
            id="new-profile-name"
            autoFocus
            value={controller.newProfileName}
            onChange={(event) =>
              controller.setNewProfileName(event.target.value)
            }
            placeholder={t("mod_library_dialogs.create_placeholder")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && controller.newProfileName.trim()) {
                event.preventDefault();
                void controller.handleCreateProfile();
              }
            }}
          />
          {controller.isDirty ? (
            <p className="text-sm text-amber-700">
              {t("mod_library_dialogs.create_dirty_warning")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("mod_library_dialogs.create_clean_hint")}
            </p>
          )}
        </div>
      </AlertDialog>

      <AlertDialog
        open={controller.isDeleteProfileDialogOpen}
        title={t("mod_library_dialogs.delete_title")}
        description={t("mod_library_dialogs.delete_description")}
        confirmLabel={t("mod_library_dialogs.delete_confirm")}
        cancelLabel={t("mod_library_dialogs.delete_cancel")}
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
              {controller.currentProfile?.name ??
                t("mod_library_dialogs.current_profile_fallback")}
            </span>{" "}
            {t("mod_library_dialogs.delete_will_be_removed_suffix")}
          </p>
          {controller.isDirty ? (
            <p className="font-bold text-destructive">
              {t("mod_library_dialogs.delete_dirty_warning")}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {t("mod_library_dialogs.delete_clean_hint")}
            </p>
          )}
        </div>
      </AlertDialog>

      <AlertDialog
        open={controller.isDependencyDialogOpen}
        title={t("mod_library_dialogs.enable_deps_title")}
        description={t("mod_library_dialogs.enable_deps_description")}
        confirmLabel={t("mod_library_dialogs.enable_deps_confirm")}
        cancelLabel={t("mod_library_dialogs.enable_deps_cancel")}
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
            message: t("mod_library_dialogs.enable_deps_skipped_feedback"),
          });
        }}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-background/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
              {t("mod_library_dialogs.mods_to_enable")}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {controller.analysis?.missingInstalledInactiveDependencies.map(
                (issue) => (
                  <li key={issue.packageId}>
                    {issue.modName ?? issue.packageId}{" "}
                    {t("mod_library_dialogs.required_by", {
                      requiredBy: issue.requiredByNames.join(", "),
                    })}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </AlertDialog>

      <AlertDialog
        open={controller.isSortDialogOpen}
        title={t("mod_library_dialogs.apply_sort_title")}
        description={t("mod_library_dialogs.apply_sort_description")}
        confirmLabel={t("mod_library_dialogs.apply_sort_confirm")}
        cancelLabel={t("mod_library_dialogs.apply_sort_cancel")}
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
            tone: currentOrderViolationCount > 0 ? "error" : "warning",
            message:
              currentOrderViolationCount > 0
                ? t("mod_library_dialogs.apply_sort_skipped_error_feedback", {
                    count: String(currentOrderViolationCount),
                  })
                : t("mod_library_dialogs.apply_sort_skipped_feedback"),
          });
        }}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-background/70 p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {t("mod_library_dialogs.recommended_active_order")}
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
