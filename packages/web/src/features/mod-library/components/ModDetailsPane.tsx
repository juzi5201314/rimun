import type { HomePageController } from "@/features/mod-library/hooks/useHomePageController";
import { Badge } from "@/shared/components/ui/badge";
import { useI18n } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import type { ModOrderEdge } from "@rimun/shared";
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
type DetailSectionTone = "default" | "danger";

type SelectedOrderViolation = {
  direction: "before" | "after";
  kind:
    | "official_anchor"
    | "dependency"
    | "load_after"
    | "load_before"
    | "force_load_after"
    | "force_load_before";
  relatedModName: string;
};

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function renderDescriptionBlocks(
  description: string | null,
  noDescriptionText: string,
) {
  if (!description) {
    return <p className="text-sm text-muted-foreground">{noDescriptionText}</p>;
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

function renderPackageList(items: string[], noneText: string) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{noneText}</p>;
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

function buildPackageIdDisplayNameMap(controller: HomePageController) {
  const displayNameByPackageId = new Map<string, string>();

  for (const mod of controller.modLibrary?.mods ?? []) {
    const packageId = mod.dependencyMetadata.packageIdNormalized;

    if (!packageId || displayNameByPackageId.has(packageId)) {
      continue;
    }

    displayNameByPackageId.set(packageId, mod.name);
  }

  return displayNameByPackageId;
}

function buildSelectedOrderViolations(input: {
  orderViolations: ModOrderEdge[];
  selectedPackageId: string | null;
  packageIdDisplayNameMap: Map<string, string>;
}) {
  if (!input.selectedPackageId) {
    return [];
  }
  const seenKeys = new Set<string>();
  const violations: SelectedOrderViolation[] = [];

  for (const edge of input.orderViolations) {
    if (
      edge.fromPackageId !== input.selectedPackageId &&
      edge.toPackageId !== input.selectedPackageId
    ) {
      continue;
    }

    const direction =
      edge.fromPackageId === input.selectedPackageId ? "before" : "after";
    const relatedPackageId =
      direction === "before" ? edge.toPackageId : edge.fromPackageId;
    const dedupeKey = `${direction}:${edge.kind}:${relatedPackageId}`;

    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    violations.push({
      direction,
      kind: edge.kind,
      relatedModName:
        input.packageIdDisplayNameMap.get(relatedPackageId) ?? relatedPackageId,
    });
  }

  return violations;
}

function getOrderViolationMoveKey(
  direction: SelectedOrderViolation["direction"],
) {
  return direction === "before"
    ? "mod_details.order_violation_move_before"
    : "mod_details.order_violation_move_after";
}

function getOrderViolationReasonKey(kind: SelectedOrderViolation["kind"]) {
  switch (kind) {
    case "dependency":
      return "mod_details.order_violation_reason_dependency";
    case "load_after":
      return "mod_details.order_violation_reason_load_after";
    case "force_load_after":
      return "mod_details.order_violation_reason_force_load_after";
    case "load_before":
      return "mod_details.order_violation_reason_load_before";
    case "force_load_before":
      return "mod_details.order_violation_reason_force_load_before";
    default:
      return "mod_details.order_violation_reason_official_anchor";
  }
}

function getOrderViolationSummaryKey(
  direction: SelectedOrderViolation["direction"],
) {
  return direction === "before"
    ? "mod_details.order_violation_summary_before"
    : "mod_details.order_violation_summary_after";
}

function getOrderViolationReasonParams(input: {
  selectedModName: string;
  violation: SelectedOrderViolation;
}) {
  if (
    input.violation.kind === "dependency" ||
    input.violation.kind === "load_after" ||
    input.violation.kind === "force_load_after"
  ) {
    return input.violation.direction === "before"
      ? {
          subject: input.violation.relatedModName,
          target: input.selectedModName,
        }
      : {
          subject: input.selectedModName,
          target: input.violation.relatedModName,
        };
  }

  return input.violation.direction === "before"
    ? {
        subject: input.selectedModName,
        target: input.violation.relatedModName,
      }
    : {
        subject: input.violation.relatedModName,
        target: input.selectedModName,
      };
}

function buildExplanationViolations(input: {
  analysis: HomePageController["analysis"];
  selectedPackageId: string | null;
  packageIdDisplayNameMap: Map<string, string>;
}) {
  if (!input.analysis) {
    return [];
  }

  return buildSelectedOrderViolations({
    orderViolations: input.analysis.edges,
    selectedPackageId: input.selectedPackageId,
    packageIdDisplayNameMap: input.packageIdDisplayNameMap,
  });
}

function formatSelectedOrderViolation(input: {
  t: TranslateFn;
  selectedModName: string;
  violation: SelectedOrderViolation;
}) {
  return [
    input.t(getOrderViolationSummaryKey(input.violation.direction), {
      subject: input.selectedModName,
      target: input.violation.relatedModName,
    }),
    input.t(
      getOrderViolationReasonKey(input.violation.kind),
      getOrderViolationReasonParams({
        selectedModName: input.selectedModName,
        violation: input.violation,
      }),
    ),
  ].join(" ");
}

function formatHardOrderDiagnostic(input: {
  edge: ModOrderEdge;
  packageIdDisplayNameMap: Map<string, string>;
  t: TranslateFn;
}) {
  const fromName =
    input.packageIdDisplayNameMap.get(input.edge.fromPackageId) ??
    input.edge.fromPackageId;
  const toName =
    input.packageIdDisplayNameMap.get(input.edge.toPackageId) ??
    input.edge.toPackageId;
  const summary = input.t("mod_details.order_violation_summary_before", {
    subject: fromName,
    target: toName,
  });

  if (input.edge.kind === "official_anchor") {
    return [
      summary,
      input.t("mod_details.order_violation_reason_official_anchor"),
    ].join(" ");
  }

  const reasonParams =
    input.edge.kind === "dependency" ||
    input.edge.kind === "load_after" ||
    input.edge.kind === "force_load_after"
      ? { subject: toName, target: fromName }
      : { subject: fromName, target: toName };

  return [
    summary,
    input.t(getOrderViolationReasonKey(input.edge.kind), reasonParams),
  ].join(" ");
}

function DetailSection({
  title,
  description,
  tone = "default",
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  tone?: DetailSectionTone;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-background/80 shadow-sm",
        tone === "danger"
          ? "border-destructive/30 bg-destructive/[0.03]"
          : "border-border/60",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        onClick={onToggle}
      >
        <div className="space-y-1">
          <p
            className={cn(
              "text-sm font-semibold",
              tone === "danger" ? "text-destructive" : "text-foreground",
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "text-xs leading-relaxed",
              tone === "danger"
                ? "text-destructive/80"
                : "text-muted-foreground",
            )}
          >
            {description}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border bg-background/90 p-1",
            tone === "danger"
              ? "border-destructive/20 text-destructive"
              : "border-border/60 text-muted-foreground",
          )}
        >
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
  const { t } = useI18n();
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
  const selectedPackageId =
    controller.selectedMod?.dependencyMetadata.packageIdNormalized ?? null;
  const packageIdDisplayNameMap = buildPackageIdDisplayNameMap(controller);
  const selectedOrderViolations = buildSelectedOrderViolations({
    orderViolations: controller.currentOrderViolations,
    selectedPackageId,
    packageIdDisplayNameMap,
  });
  const hardOrderDiagnosticMessages = hardOrderDiagnostics.map((diagnostic) => {
    const edge = controller.analysis?.edges.find(
      (candidate) =>
        candidate.fromPackageId === diagnostic.packageIds[0] &&
        candidate.toPackageId === diagnostic.packageIds[1],
    );

    return {
      key: `${diagnostic.code}:${diagnostic.packageIds.join(":")}:${diagnostic.message}`,
      message: edge
        ? formatHardOrderDiagnostic({
            edge,
            packageIdDisplayNameMap,
            t,
          })
        : diagnostic.message,
    };
  });
  const selectedExplanationViolations = buildExplanationViolations({
    analysis: controller.analysis,
    selectedPackageId,
    packageIdDisplayNameMap,
  });
  const resolvedVersion =
    controller.selectedMod?.version ?? t("mod_details.unknown_version");
  const supportedGameVersions =
    controller.selectedMod?.dependencyMetadata.supportedVersions ?? [];

  return (
    <aside
      data-testid="mod-details-pane"
      className="flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden bg-card/10"
    >
      {controller.selectedMod ? (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-border/60 bg-background/40 p-6">
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {t("mod_details.module_detail")}
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
                      {controller.selectedMod.enabled
                        ? t("common.enabled")
                        : t("common.disabled")}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="h-7 rounded-full px-3 text-muted-foreground"
                    >
                      {controller.selectedMod.source === "installation"
                        ? t("mod_details.source_local_install")
                        : t("mod_details.source_workshop")}
                    </Badge>
                    {controller.selectedMod.isOfficial ? (
                      <Badge
                        variant="outline"
                        className="h-7 rounded-full border-primary/30 bg-primary/10 px-3 text-primary"
                      >
                        {t("mod_details.official_core")}
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
                    {t("mod_details.package_id_label")}
                  </p>
                  <p
                    className="mt-2 break-all font-mono text-xs text-foreground select-text"
                    title={
                      controller.selectedMod.packageId ??
                      t("common.not_available")
                    }
                  >
                    {controller.selectedMod.packageId ?? t("common.none")}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("mod_details.author_version_label")}
                  </p>
                  <div className="mt-2 space-y-1">
                    <span
                      className="block break-words text-sm font-medium text-foreground"
                      title={
                        controller.selectedMod.author ??
                        t("mod_details.unknown_author_title")
                      }
                    >
                      {controller.selectedMod.author ??
                        t("mod_details.unknown_author")}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {t("mod_details.version_format", {
                        version: resolvedVersion,
                      })}
                    </span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("mod_details.supported_game_versions_label")}
                  </p>
                  <div className="mt-2">
                    {renderPackageList(
                      supportedGameVersions,
                      t("mod_details.no_supported_game_versions"),
                    )}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div
            data-testid="mod-details-scroll"
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto bg-background/5 p-6"
          >
            <div className="space-y-4">
              {hardOrderDiagnostics.length > 0 ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <span className="h-2 w-2 rounded-full bg-destructive" />
                    {t("mod_details.load_order_errors")}
                  </p>
                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-destructive/90">
                    {hardOrderDiagnosticMessages.map((diagnostic) => (
                      <li key={diagnostic.key}>{diagnostic.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {controller.analysis?.hasBlockingIssues ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <span className="h-2 w-2 rounded-full bg-destructive" />
                    {t("mod_details.critical_deployment_issues")}
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
                            {t("mod_details.dependency_required_by", {
                              requiredBy: issue.requiredByNames.join(", "),
                            })}
                          </li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <DetailSection
                title={t("mod_details.section_description_title")}
                description={t("mod_details.section_description_description")}
                open={openSections.description}
                onToggle={() =>
                  setOpenSections((current) => ({
                    ...current,
                    description: !current.description,
                  }))
                }
              >
                <div className="space-y-4 text-sm leading-relaxed text-foreground/90 select-text">
                  {renderDescriptionBlocks(
                    controller.selectedMod.description,
                    t("mod_details.no_description"),
                  )}
                </div>
              </DetailSection>

              <DetailSection
                title={t("mod_details.section_order_hints_title")}
                description={t("mod_details.section_order_hints_description")}
                tone={selectedOrderViolations.length > 0 ? "danger" : "default"}
                open={openSections.orderHints}
                onToggle={() =>
                  setOpenSections((current) => ({
                    ...current,
                    orderHints: !current.orderHints,
                  }))
                }
              >
                <div className="grid gap-3">
                  {selectedOrderViolations.length > 0 ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                        <span className="h-2 w-2 rounded-full bg-destructive" />
                        {t("mod_details.selected_order_conflicts_title", {
                          count: String(selectedOrderViolations.length),
                        })}
                      </p>
                      <ul className="mt-3 flex flex-col gap-3 text-sm text-destructive/90">
                        {selectedOrderViolations.map((violation) => {
                          const relationMessage = t(
                            getOrderViolationMoveKey(violation.direction),
                            {
                              target: violation.relatedModName,
                            },
                          );
                          const reasonMessage = t(
                            getOrderViolationReasonKey(violation.kind),
                            getOrderViolationReasonParams({
                              selectedModName: controller.selectedMod.name,
                              violation,
                            }),
                          );

                          return (
                            <li
                              key={`${violation.direction}:${violation.kind}:${violation.relatedModName}`}
                              className="rounded-xl border border-destructive/20 bg-background/80 px-3 py-3"
                            >
                              <p className="font-medium">{relationMessage}</p>
                              <p className="mt-1 text-xs leading-relaxed text-destructive/80">
                                {reasonMessage}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {[
                    {
                      label: t("mod_details.absolute_dependencies"),
                      items:
                        controller.selectedMod.dependencyMetadata.dependencies,
                      color: "bg-blue-500",
                    },
                    {
                      label: t("mod_details.initialize_after"),
                      items:
                        controller.selectedMod.dependencyMetadata.loadAfter,
                      color: "bg-emerald-500",
                    },
                    {
                      label: t("mod_details.initialize_before"),
                      items:
                        controller.selectedMod.dependencyMetadata.loadBefore,
                      color: "bg-amber-500",
                    },
                    {
                      label: t("mod_details.incompatible_modules"),
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
                      {renderPackageList(items, t("common.none"))}
                    </div>
                  ))}
                </div>
              </DetailSection>

              {selectedExplanationViolations.length ? (
                <DetailSection
                  title={t("mod_details.section_analysis_title")}
                  description={t("mod_details.section_analysis_description")}
                  open={openSections.analysis}
                  onToggle={() =>
                    setOpenSections((current) => ({
                      ...current,
                      analysis: !current.analysis,
                    }))
                  }
                >
                  <ul className="space-y-3 text-sm leading-relaxed text-foreground/85 select-text">
                    {selectedExplanationViolations.map((violation, index) => (
                      <li
                        key={`${violation.direction}:${violation.kind}:${violation.relatedModName}`}
                        className="flex gap-3"
                      >
                        <span className="font-semibold text-primary">
                          {index + 1}.
                        </span>
                        <span>
                          {formatSelectedOrderViolation({
                            t,
                            selectedModName: controller.selectedMod.name,
                            violation,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </DetailSection>
              ) : null}

              <DetailSection
                title={t("mod_details.section_paths_title")}
                description={t("mod_details.section_paths_description")}
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
                      {t("mod_details.host_system_location")}
                    </p>
                    <p className="break-all rounded-xl border border-border/50 bg-background px-3 py-3 text-muted-foreground select-text">
                      {controller.selectedMod.windowsPath}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="flex items-center gap-2 font-sans text-xs font-medium text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5" />
                      {t("mod_details.metadata_manifest")}
                    </p>
                    <p className="break-all rounded-xl border border-border/50 bg-background px-3 py-3 text-muted-foreground select-text">
                      {controller.selectedMod.manifestPath ??
                        t("common.not_available")}
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
                {t("mod_details.no_module_selected_title")}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t("mod_details.no_module_selected_description")}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
