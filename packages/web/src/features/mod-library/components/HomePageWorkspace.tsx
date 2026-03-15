import type { HomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { useI18n } from "@/shared/i18n";
import { LoaderCircle } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ModDetailsPane } from "./ModDetailsPane";
import { ModLibraryPane } from "./ModLibraryPane";

function resolveLoadingLabel(
  controller: HomePageController,
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  if (controller.applyActivePackageIdsMutation.isPending) {
    return t("mod_library_loading.synchronizing_order");
  }

  if (controller.saveProfileMutation.isPending) {
    return t("mod_library_loading.persisting_data");
  }

  if (controller.switchProfileMutation.isPending) {
    return t("mod_library_loading.loading_profile");
  }

  if (controller.createProfileMutation.isPending) {
    return t("mod_library_loading.generating_profile");
  }

  if (controller.deleteProfileMutation.isPending) {
    return t("mod_library_loading.removing_record");
  }

  return t("mod_library_loading.analyzing_dependencies");
}

export function HomePageWorkspace({
  asideWidth,
  controller,
  onResizeStart,
}: {
  asideWidth: number;
  controller: HomePageController;
  onResizeStart: (event: ReactMouseEvent) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="relative flex min-h-0 w-full flex-1 bg-background/5">
      {controller.loadingOverlayVisible ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md">
          <div className="rounded-2xl border border-border/40 bg-card/95 px-10 py-8 text-center shadow-2xl ring-1 ring-primary/10">
            <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.4em] text-primary/80">
              {resolveLoadingLabel(controller, t)}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{ width: `${100 - asideWidth}%` }}
      >
        <ModLibraryPane controller={controller} />
      </div>

      <div
        className="z-20 flex h-full w-1 shrink-0 cursor-col-resize items-center justify-center bg-border/40 transition-all hover:w-1.5 hover:bg-primary/40"
        onMouseDown={onResizeStart}
      >
        <div className="h-16 w-[1px] bg-border/60" />
      </div>

      <div
        className="flex min-h-0 shrink-0 flex-col"
        style={{ width: `${asideWidth}%` }}
      >
        <ModDetailsPane controller={controller} />
      </div>
    </div>
  );
}
