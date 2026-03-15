import type { HomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FolderSearch,
  HardDrive,
  Package,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type DetailSectionId = "description" | "orderHints" | "analysis" | "paths";

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

function DetailSection({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-background/80 shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        onClick={onToggle}
      >
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 bg-background/90 p-1 text-muted-foreground">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>

      {open ? (
        <div className="border-t border-border/50 px-5 py-5">{children}</div>
      ) : null}
    </section>
  );
}

export function ModDetailsPane({
  controller,
}: {
  controller: HomePageController;
}) {
  const selectedModId = controller.selectedMod?.id ?? null;
  const [openSections, setOpenSections] = useState<
    Record<DetailSectionId, boolean>
  >({
    description: true,
    orderHints: false,
    analysis: true,
    paths: false,
  });

  useEffect(() => {
    if (selectedModId === null) {
      setOpenSections({
        description: true,
        orderHints: false,
        analysis: true,
        paths: false,
      });
      return;
    }

    setOpenSections({
      description: true,
      orderHints: false,
      analysis: true,
      paths: false,
    });
  }, [selectedModId]);

  const hardOrderDiagnostics =
    controller.analysis?.diagnostics.filter(
      (diagnostic) => diagnostic.code === "hard_order_violation",
    ) ?? [];

  return (
    <aside className="flex shrink-0 flex-col overflow-hidden bg-card/10">
      {controller.selectedMod ? (
        <div className="flex h-full flex-col">
          <header className="shrink-0 border-b border-border/60 bg-background/40 p-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Module Detail
                    </p>
                    <h3 className="text-2xl font-black tracking-tight text-foreground">
                      {controller.selectedMod.name}
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={
                        controller.selectedMod.enabled ? "default" : "outline"
                      }
                      className={cn(
                        "h-7 rounded-full px-3",
                        controller.selectedMod.enabled
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground",
                      )}
                    >
                      {controller.selectedMod.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="h-7 rounded-full px-3 text-muted-foreground"
                    >
                      {controller.selectedMod.source === "installation"
                        ? "Local install"
                        : "Workshop"}
                    </Badge>
                    {controller.selectedMod.isOfficial ? (
                      <Badge
                        variant="outline"
                        className="h-7 rounded-full border-primary/30 bg-primary/10 px-3 text-primary"
                      >
                        Official core
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {controller.selectedMod.isOfficial ? (
                  <div className="shrink-0 rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary shadow-sm">
                    <ShieldCheck className="h-7 w-7" />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Package ID
                  </p>
                  <p
                    className="mt-2 break-all font-mono text-xs text-foreground select-text"
                    title={controller.selectedMod.packageId ?? "N/A"}
                  >
                    {controller.selectedMod.packageId ?? "None"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Author & Version
                  </p>
                  <div className="mt-2 space-y-1">
                    <span
                      className="block break-words text-sm font-medium text-foreground"
                      title={controller.selectedMod.author ?? "Unknown author"}
                    >
                      {controller.selectedMod.author ?? "Unknown"}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      v{controller.selectedMod.version ?? "?.?"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="no-scrollbar flex-1 overflow-y-auto bg-background/5 p-6">
            <div className="space-y-4">
              {hardOrderDiagnostics.length > 0 ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <span className="h-2 w-2 rounded-full bg-destructive" />
                    Load order errors
                  </p>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-destructive/90">
                    {hardOrderDiagnostics.map((diagnostic) => (
                      <li
                        key={`${diagnostic.code}:${diagnostic.packageIds.join(":")}:${diagnostic.message}`}
                      >
                        {diagnostic.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {controller.analysis?.hasBlockingIssues ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <span className="h-2 w-2 rounded-full bg-destructive" />
                    Critical deployment issues
                  </p>
                  {controller.analysis.missingUnavailableDependencies.length >
                  0 ? (
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-destructive/90">
                      {controller.analysis.missingUnavailableDependencies.map(
                        (issue) => (
                          <li key={issue.packageId}>
                            <span className="font-mono font-semibold">
                              {issue.packageId}
                            </span>{" "}
                            is required by {issue.requiredByNames.join(", ")}.
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <DetailSection
                title="Description"
                description="Primary summary shown to users before they inspect compatibility details."
                open={openSections.description}
                onToggle={() =>
                  setOpenSections((current) => ({
                    ...current,
                    description: !current.description,
                  }))
                }
              >
                <div className="space-y-4 text-sm leading-relaxed text-foreground/90 select-text">
                  {renderDescriptionBlocks(controller.selectedMod.description)}
                </div>
              </DetailSection>

              <DetailSection
                title="Execution Order Hints"
                description="Dependency and sort metadata that matters when you need to troubleshoot ordering."
                open={openSections.orderHints}
                onToggle={() =>
                  setOpenSections((current) => ({
                    ...current,
                    orderHints: !current.orderHints,
                  }))
                }
              >
                <div className="grid gap-3">
                  {[
                    {
                      label: "Absolute Dependencies",
                      items:
                        controller.selectedMod.dependencyMetadata.dependencies,
                      color: "bg-blue-500",
                    },
                    {
                      label: "Initialize After",
                      items:
                        controller.selectedMod.dependencyMetadata.loadAfter,
                      color: "bg-emerald-500",
                    },
                    {
                      label: "Initialize Before",
                      items:
                        controller.selectedMod.dependencyMetadata.loadBefore,
                      color: "bg-amber-500",
                    },
                    {
                      label: "Incompatible Modules",
                      items:
                        controller.selectedMod.dependencyMetadata
                          .incompatibleWith,
                      color: "bg-destructive",
                    },
                  ].map(({ label, items, color }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-border/50 bg-background p-4"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <div className={cn("h-2 w-2 rounded-full", color)} />
                        <p className="text-xs font-medium text-muted-foreground">
                          {label}
                        </p>
                      </div>
                      {renderPackageList(items)}
                    </div>
                  ))}
                </div>
              </DetailSection>

              {controller.selectedExplanation?.reasons.length ? (
                <DetailSection
                  title="Deployment Logic Analysis"
                  description="Why this mod lands in its current position or triggers a recommendation."
                  open={openSections.analysis}
                  onToggle={() =>
                    setOpenSections((current) => ({
                      ...current,
                      analysis: !current.analysis,
                    }))
                  }
                >
                  <ul className="space-y-3 text-sm leading-relaxed text-foreground/85 select-text">
                    {controller.selectedExplanation.reasons.map(
                      (reason, index) => (
                        <li key={reason} className="flex gap-3">
                          <span className="font-semibold text-primary">
                            {index + 1}.
                          </span>
                          <span>{reason}</span>
                        </li>
                      ),
                    )}
                  </ul>
                </DetailSection>
              ) : null}

              <DetailSection
                title="Physical Environment"
                description="Underlying filesystem paths for manual inspection and debugging."
                open={openSections.paths}
                onToggle={() =>
                  setOpenSections((current) => ({
                    ...current,
                    paths: !current.paths,
                  }))
                }
              >
                <div className="space-y-4 font-mono text-xs">
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 font-sans text-xs font-medium text-muted-foreground">
                      <FolderSearch className="h-3.5 w-3.5" />
                      Host system location
                    </p>
                    <p className="break-all rounded-xl border border-border/50 bg-background px-3 py-3 text-muted-foreground select-text">
                      {controller.selectedMod.windowsPath}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 font-sans text-xs font-medium text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5" />
                      Metadata manifest
                    </p>
                    <p className="break-all rounded-xl border border-border/50 bg-background px-3 py-3 text-muted-foreground select-text">
                      {controller.selectedMod.manifestPath ?? "N/A"}
                    </p>
                  </div>
                </div>
              </DetailSection>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center bg-background/5 p-12 text-center">
          <div className="max-w-xs space-y-6 animate-in fade-in zoom-in-95 duration-700">
            <div className="relative mx-auto h-24 w-24 opacity-10">
              <Package className="h-full w-full text-muted-foreground" />
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold text-muted-foreground">
                No module selected
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Select a module from the list to inspect its description,
                ordering hints, and filesystem paths.
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
