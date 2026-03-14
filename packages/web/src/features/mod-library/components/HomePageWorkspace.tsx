import type { HomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { LoaderCircle } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ModDetailsPane } from "./ModDetailsPane";
import { ModLibraryPane } from "./ModLibraryPane";

function resolveLoadingLabel(controller: HomePageController) {
  if (controller.applyActivePackageIdsMutation.isPending) {
    return "Synchronizing Order";
  }

  if (controller.saveProfileMutation.isPending) {
    return "Persisting Data";
  }

  if (controller.switchProfileMutation.isPending) {
    return "Loading Profile";
  }

  if (controller.createProfileMutation.isPending) {
    return "Generating Profile";
  }

  if (controller.deleteProfileMutation.isPending) {
    return "Removing Record";
  }

  return "Analyzing Dependencies";
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
  return (
    <div className="relative flex min-h-0 w-full flex-1 bg-background/5">
      {controller.loadingOverlayVisible ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md">
          <div className="rounded-2xl border border-border/40 bg-card/95 px-10 py-8 text-center shadow-2xl ring-1 ring-primary/10">
            <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.4em] text-primary/80">
              {resolveLoadingLabel(controller)}
            </p>
          </div>
        </div>
      ) : null}

      <div
        className="flex min-w-0 flex-col"
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
        className="flex shrink-0 flex-col"
        style={{ width: `${asideWidth}%` }}
      >
        <ModDetailsPane controller={controller} />
      </div>
    </div>
  );
}
