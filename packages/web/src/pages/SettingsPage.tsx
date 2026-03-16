import { LlmSettingsSection } from "@/features/settings/components/LlmSettingsSection";
import { useDetectPathsMutation } from "@/features/settings/hooks/useDetectPathsMutation";
import { useSaveSettingsMutation } from "@/features/settings/hooks/useSaveSettingsMutation";
import { useSettingsQuery } from "@/features/settings/hooks/useSettingsQuery";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { type UiLocale, useI18n } from "@/shared/i18n";
import type {
  AppError,
  AppSettings,
  BootstrapPayload,
  DistributionChannel,
  PathSelection,
  SaveSettingsInput,
  ValidatePathResult,
} from "@rimun/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderSearch,
  HardDrive,
  LoaderCircle,
  Settings as SettingsIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

const FALLBACK_SUPPORTED_CHANNELS: DistributionChannel[] = ["steam", "manual"];

type SettingsFormState = {
  channel: DistributionChannel;
  installationPath: string;
  workshopPath: string;
  configPath: string;
};

type FeedbackTone = "success" | "error" | "warning";

type FeedbackState = {
  tone: FeedbackTone;
  message: string;
} | null;

function toFormState(
  settings:
    | AppSettings
    | PathSelection
    | Pick<
        SaveSettingsInput,
        "channel" | "installationPath" | "workshopPath" | "configPath"
      >,
): SettingsFormState {
  return {
    channel: settings.channel,
    installationPath: settings.installationPath ?? "",
    workshopPath: settings.workshopPath ?? "",
    configPath: settings.configPath ?? "",
  };
}

function toSaveSettingsInput(draft: SettingsFormState): SaveSettingsInput {
  return {
    channel: draft.channel,
    installationPath: draft.installationPath.trim(),
    workshopPath: draft.workshopPath.trim() || null,
    configPath: draft.configPath.trim() || null,
  };
}

function formatChannelLabel(
  t: (key: string, params?: Record<string, unknown>) => string,
  channel: DistributionChannel,
) {
  switch (channel) {
    case "steam":
      return t("settings.channel.steam");
    case "gog":
      return t("settings.channel.gog");
    case "epic":
      return t("settings.channel.epic");
    case "manual":
      return t("settings.channel.manual");
    default:
      return channel;
  }
}

function ValidationCard({
  validation,
}: {
  validation: ValidatePathResult[];
}) {
  const { t } = useI18n();

  if (!validation.length) {
    return null;
  }

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("settings.validation.card_title")}
        </CardTitle>
        <CardDescription>
          {t("settings.validation.card_description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {validation.map((entry) => {
          const isValid = entry.issues.length === 0;

          return (
            <div
              key={`${entry.kind}:${entry.windowsPath}`}
              className="rounded-lg border border-border/60 bg-background/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={isValid ? "default" : "destructive"}>
                  {entry.kind}
                </Badge>
                <Badge variant="outline" className="uppercase">
                  {entry.channel}
                </Badge>
                <span className="text-sm font-bold">
                  {isValid
                    ? t("settings.validation.validated")
                    : t("settings.validation.needs_attention")}
                </span>
              </div>
              <p className="mt-3 break-all font-mono text-xs">
                {entry.windowsPath}
              </p>
              {entry.wslPath ? (
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {t("settings.validation.wsl_prefix")} {entry.wslPath}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                {t("settings.validation.exists_label")}{" "}
                {entry.exists ? t("common.yes") : t("common.no")} /{" "}
                {t("settings.validation.readable_label")}{" "}
                {entry.readable ? t("common.yes") : t("common.no")}
              </p>
              {entry.issues.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-destructive">
                  {entry.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DetectionErrors({ errors }: { errors: AppError[] }) {
  const { t } = useI18n();

  if (!errors.length) {
    return null;
  }

  return (
    <Card className="border-destructive/60 bg-destructive/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {t("settings.detection.card_title")}
        </CardTitle>
        <CardDescription className="text-destructive/80">
          {t("settings.detection.card_description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {errors.map((error) => (
          <div
            key={`${error.code}:${error.message}`}
            className="rounded-lg border border-destructive/40 bg-background/70 p-4"
          >
            <p className="text-sm font-bold text-destructive">
              {error.message}
            </p>
            {error.detail ? (
              <p className="mt-1 text-sm text-destructive/80">{error.detail}</p>
            ) : null}
            <p className="mt-2 text-[11px] font-black uppercase tracking-widest text-destructive/80">
              {error.recoverable
                ? t("settings.detection.recoverable")
                : t("settings.detection.blocking")}{" "}
              / {error.code}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const settingsQuery = useSettingsQuery();
  const detectPathsMutation = useDetectPathsMutation();
  const saveSettingsMutation = useSaveSettingsMutation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SettingsFormState>({
    channel: "steam",
    installationPath: "",
    workshopPath: "",
    configPath: "",
  });
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [lastValidation, setLastValidation] = useState<ValidatePathResult[]>(
    [],
  );
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(toFormState(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const cachedBootstrap = queryClient.getQueryData<BootstrapPayload>([
    "bootstrap",
  ]);
  const supportedChannels =
    cachedBootstrap?.supportedChannels ?? FALLBACK_SUPPORTED_CHANNELS;
  const selectableChannels = Array.from(new Set(supportedChannels));
  const detectableChannels = selectableChannels.filter(
    (channel) => channel !== "manual",
  );
  const isBusy =
    settingsQuery.isPending ||
    detectPathsMutation.isPending ||
    saveSettingsMutation.isPending;

  function handleFieldChange(field: keyof SettingsFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const nextValue = event.target.value;
      setFeedback(null);
      setDraft((currentDraft) => ({
        ...currentDraft,
        [field]: nextValue,
      }));
    };
  }

  async function handleAutoDetect() {
    if (!detectableChannels.length) {
      setFeedback({
        tone: "warning",
        message: t("settings.feedback.no_detectable_channels"),
      });
      return;
    }

    try {
      const detection = await detectPathsMutation.mutateAsync({
        preferredChannels: detectableChannels,
        allowFallbackToManual: true,
      });

      if (detection.preferredSelection) {
        setDraft(toFormState(detection.preferredSelection));
      }

      setFeedback({
        tone: detection.requiresManualSelection ? "warning" : "success",
        message: detection.requiresManualSelection
          ? t("settings.feedback.auto_detect_manual_required")
          : t("settings.feedback.auto_detect_finished"),
      });
    } catch {
      setFeedback({
        tone: "error",
        message: t("settings.feedback.auto_detect_failed"),
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.installationPath.trim()) {
      setFeedback({
        tone: "error",
        message: t("settings.feedback.install_required"),
      });
      return;
    }

    try {
      const savedSettings = await saveSettingsMutation.mutateAsync(
        toSaveSettingsInput(draft),
      );

      setDraft(toFormState(savedSettings.settings));
      setLastValidation(savedSettings.validation);
      setFeedback({
        tone: savedSettings.validation.some((entry) => entry.issues.length > 0)
          ? "warning"
          : "success",
        message: savedSettings.validation.some(
          (entry) => entry.issues.length > 0,
        )
          ? t("settings.feedback.save_warning")
          : t("settings.feedback.save_success"),
      });
    } catch {
      setFeedback({
        tone: "error",
        message: t("settings.feedback.save_failed"),
      });
    }
  }

  if (settingsQuery.isError) {
    const message =
      settingsQuery.error instanceof Error
        ? settingsQuery.error.message
        : t("settings.error.failed_load_fallback");

    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("settings.error.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-bold">
              {t("settings.error.failed_load_title")}
            </p>
            <p className="mt-2 text-sm text-destructive/80">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 border-b-2 border-border bg-card px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-3 text-2xl font-black tracking-tight">
              <SettingsIcon className="h-6 w-6" />
              {t("settings.page.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.page.description")}
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => void handleAutoDetect()}
            disabled={isBusy}
            className="gap-2"
          >
            {detectPathsMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FolderSearch className="h-4 w-4" />
            )}
            {t("settings.page.auto_detect_paths")}
          </Button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        {feedback ? (
          <output
            aria-live="polite"
            className={
              feedback.tone === "success"
                ? "rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary"
                : feedback.tone === "warning"
                  ? "rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700"
                  : "rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            }
          >
            {feedback.message}
          </output>
        ) : null}

        <Card className="border-border/60 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("settings.ui_language.card_title")}
            </CardTitle>
            <CardDescription>
              {t("settings.ui_language.card_description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="ui-language"
                className="text-sm font-bold uppercase text-muted-foreground"
              >
                {t("settings.ui_language.label")}
              </label>
              <select
                id="ui-language"
                className="flex h-10 w-full border-2 border-border bg-input px-3 py-2 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={locale}
                onChange={(event) => setLocale(event.target.value as UiLocale)}
              >
                <option value="en-us">
                  {t("settings.ui_language.option_en_us")}
                </option>
                <option value="zh-cn">
                  {t("settings.ui_language.option_zh_cn")}
                </option>
              </select>
              <p className="text-xs text-muted-foreground">
                {t("settings.ui_language.help")}
              </p>
            </div>
          </CardContent>
        </Card>

        {cachedBootstrap ? (
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("settings.bootstrap.card_title")}
              </CardTitle>
              <CardDescription>
                {t("settings.bootstrap.card_description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  {t("settings.bootstrap.supported_channels")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectableChannels.map((channel) => (
                    <Badge
                      key={channel}
                      variant="secondary"
                      className="uppercase"
                    >
                      {formatChannelLabel(t, channel)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  {t("settings.bootstrap.runtime")}
                </p>
                <p className="text-sm font-bold">
                  {cachedBootstrap.environment.isWsl
                    ? `${cachedBootstrap.environment.platform} / ${t("settings.bootstrap.wsl_suffix")}`
                    : cachedBootstrap.environment.platform}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <DetectionErrors errors={detectPathsMutation.data?.errors ?? []} />

        {detectPathsMutation.data ? (
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("settings.last_detection.card_title")}
              </CardTitle>
              <CardDescription>
                {t("settings.last_detection.card_description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    detectPathsMutation.data.requiresManualSelection
                      ? "outline"
                      : "default"
                  }
                >
                  {detectPathsMutation.data.requiresManualSelection
                    ? t("settings.last_detection.manual_selection_required")
                    : t(
                        "settings.last_detection.preferred_selection_available",
                      )}
                </Badge>
                <Badge variant="outline">
                  {t("settings.last_detection.candidates_count", {
                    count: detectPathsMutation.data.candidates.length,
                  })}
                </Badge>
              </div>
              {detectPathsMutation.data.preferredSelection ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      {t("settings.last_detection.installation")}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {detectPathsMutation.data.preferredSelection
                        .installationPath ??
                        t("settings.last_detection.not_detected")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      {t("settings.last_detection.workshop")}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {detectPathsMutation.data.preferredSelection
                        .workshopPath ??
                        t("settings.last_detection.not_detected")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      {t("settings.last_detection.config")}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {detectPathsMutation.data.preferredSelection.configPath ??
                        t("settings.last_detection.not_detected")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                  {t("settings.last_detection.no_preferred_selection")}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)}>
          <fieldset disabled={isBusy} className="space-y-6">
            <Card className="border-border/60 bg-card/60">
              <CardHeader className="pb-0">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-4 text-left"
                  onClick={() => setIsGuideOpen((current) => !current)}
                >
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {t("settings.path_guide.title")}
                    </CardTitle>
                    <CardDescription>
                      {t("settings.path_guide.description")}
                    </CardDescription>
                  </div>
                  <span className="rounded-full border border-border/60 bg-background/80 p-1.5 text-muted-foreground">
                    {isGuideOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                </button>
              </CardHeader>
              {isGuideOpen ? (
                <CardContent className="grid gap-3 pt-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      {t("settings.path_guide.enter_windows_paths_title")}
                    </p>
                    <p className="mt-2 text-sm text-foreground/90">
                      {t("settings.path_guide.enter_windows_paths_prefix")}{" "}
                      <span className="font-mono text-xs">
                        C:\Games\RimWorld
                      </span>
                      {t("settings.path_guide.enter_windows_paths_suffix_1")}{" "}
                      <span className="font-mono text-xs">/mnt/c/...</span>{" "}
                      {t("settings.path_guide.enter_windows_paths_suffix_2")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      {t("settings.path_guide.required_first_title")}
                    </p>
                    <p className="mt-2 text-sm text-foreground/90">
                      {t("settings.path_guide.required_first_body")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      {t("settings.path_guide.auto_detect_flow_title")}
                    </p>
                    <p className="mt-2 text-sm text-foreground/90">
                      {t("settings.path_guide.auto_detect_flow_body")}
                    </p>
                  </div>
                </CardContent>
              ) : null}
            </Card>

            <Card>
              <CardHeader className="bg-muted/50 py-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <HardDrive className="h-5 w-5" />
                  {t("settings.paths.card_title")}
                </CardTitle>
                <CardDescription className="font-bold">
                  {t("settings.paths.card_description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-1.5">
                  <label
                    htmlFor="channel"
                    className="text-sm font-bold uppercase text-muted-foreground"
                  >
                    {t("settings.paths.distribution_channel_label")}
                  </label>
                  <select
                    id="channel"
                    className="flex h-10 w-full border-2 border-border bg-input px-3 py-2 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft.channel}
                    onChange={handleFieldChange("channel")}
                  >
                    {selectableChannels.map((channel) => (
                      <option key={channel} value={channel}>
                        {formatChannelLabel(t, channel)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.paths.distribution_channel_help")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="installationPath"
                    className="text-sm font-bold uppercase text-muted-foreground"
                  >
                    {t("settings.paths.installation_path_label")}
                  </label>
                  <Input
                    id="installationPath"
                    name="installationPath"
                    value={draft.installationPath}
                    onChange={handleFieldChange("installationPath")}
                    placeholder={t(
                      "settings.paths.installation_path_placeholder",
                    )}
                    className="font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings.paths.installation_path_help")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="workshopPath"
                    className="text-sm font-bold uppercase text-muted-foreground"
                  >
                    {t("settings.paths.workshop_path_label")}
                  </label>
                  <Input
                    id="workshopPath"
                    name="workshopPath"
                    value={draft.workshopPath}
                    onChange={handleFieldChange("workshopPath")}
                    placeholder={t("settings.paths.workshop_path_placeholder")}
                    className="font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings.paths.workshop_path_help")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="configPath"
                    className="text-sm font-bold uppercase text-muted-foreground"
                  >
                    {t("settings.paths.config_path_label")}
                  </label>
                  <Input
                    id="configPath"
                    name="configPath"
                    value={draft.configPath}
                    onChange={handleFieldChange("configPath")}
                    placeholder={t("settings.paths.config_path_placeholder")}
                    className="font-mono"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings.paths.config_path_help")}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap justify-between gap-3 bg-muted/50 py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  {t("settings.paths.save_footer_help")}
                </div>
                <Button type="submit" className="w-32">
                  {saveSettingsMutation.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("common.save")}
                </Button>
              </CardFooter>
            </Card>
          </fieldset>
        </form>

        <ValidationCard validation={lastValidation} />

        <LlmSettingsSection />
      </div>
    </div>
  );
}
