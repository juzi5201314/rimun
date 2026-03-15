import { HomePageDialogs } from "@/features/mod-library/components/HomePageDialogs";
import { HomePageWorkspace } from "@/features/mod-library/components/HomePageWorkspace";
import { useHomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { useI18n } from "@/shared/i18n";
import { AlertTriangle, FolderSearch, HardDrive } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useState } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router-dom";

export function HomePage() {
  const controller = useHomePageController();
  const { t } = useI18n();
  const [asideWidth, setAsideWidth] = useState(38);
  const routeBlocker = useBlocker(controller.isDirty);

  useBeforeUnload((event) => {
    if (!controller.isDirty) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });

  function handleMouseDown(event: ReactMouseEvent) {
    const startX = event.clientX;
    const startWidth = asideWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaPercent = (deltaX / window.innerWidth) * 100;
      const nextWidth = Math.min(Math.max(startWidth - deltaPercent, 28), 52);
      setAsideWidth(nextWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  if (
    controller.profileCatalogQuery.isPending ||
    controller.modSourceSnapshotQuery.isPending
  ) {
    return (
      <div className="flex h-full items-center justify-center bg-background/40">
        <p className="rw-text animate-pulse font-black uppercase tracking-widest text-primary">
          {t("common.loading_profiles")}
        </p>
      </div>
    );
  }

  if (controller.profileCatalogQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-xl border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("home.failed_load_profiles_title")}
            </CardTitle>
            <CardDescription>
              {t("home.failed_load_profiles_description")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (controller.modSourceSnapshotQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-xl border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("home.failed_load_mod_library_title")}
            </CardTitle>
            <CardDescription>
              {t("home.failed_load_mod_library_description")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!controller.modLibrary) {
    return null;
  }

  if (controller.modLibrary.requiresConfiguration) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-2xl border-border/60 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <HardDrive className="h-6 w-6 text-primary" />
              {t("home.needs_configuration_title")}
            </CardTitle>
            <CardDescription>
              {t("home.needs_configuration_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {controller.modLibrary.errors.length ? (
              <div className="space-y-3">
                {controller.modLibrary.errors.map((error) => (
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
                {t("home.open_core_config")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <HomePageWorkspace
        asideWidth={asideWidth}
        controller={controller}
        onResizeStart={handleMouseDown}
      />
      <HomePageDialogs controller={controller} routeBlocker={routeBlocker} />
    </>
  );
}
