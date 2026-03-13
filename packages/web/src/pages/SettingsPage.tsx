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

function formatChannelLabel(channel: DistributionChannel) {
  switch (channel) {
    case "steam":
      return "Steam";
    case "gog":
      return "GOG";
    case "epic":
      return "Epic";
    case "manual":
      return "Manual";
    default:
      return channel;
  }
}

function ValidationCard({
  validation,
}: {
  validation: ValidatePathResult[];
}) {
  if (!validation.length) {
    return null;
  }

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Last Save Validation</CardTitle>
        <CardDescription>
          Backend validation returned immediately after persisting settings.
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
                  {isValid ? "Validated" : "Needs attention"}
                </span>
              </div>
              <p className="mt-3 break-all font-mono text-xs">
                {entry.windowsPath}
              </p>
              {entry.wslPath ? (
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  WSL: {entry.wslPath}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                Exists: {entry.exists ? "yes" : "no"} / Readable:{" "}
                {entry.readable ? "yes" : "no"}
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
  if (!errors.length) {
    return null;
  }

  return (
    <Card className="border-destructive/60 bg-destructive/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Detection Feedback
        </CardTitle>
        <CardDescription className="text-destructive/80">
          Structured errors returned by the backend path detector.
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
              {error.recoverable ? "Recoverable" : "Blocking"} / {error.code}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
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
        message:
          "The current backend does not expose any automatically detectable distribution channel.",
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
          ? "Automatic detection finished, but manual path selection is still required."
          : "Automatic path detection finished.",
      });
    } catch {
      setFeedback({
        tone: "error",
        message: "Automatic path detection failed.",
      });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.installationPath.trim()) {
      setFeedback({
        tone: "error",
        message: "Installation path is required before saving.",
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
          ? "Settings saved, but backend validation reported path issues."
          : "Settings saved.",
      });
    } catch {
      setFeedback({
        tone: "error",
        message: "Saving settings failed.",
      });
    }
  }

  if (settingsQuery.isError) {
    const message =
      settingsQuery.error instanceof Error
        ? settingsQuery.error.message
        : "Failed to load settings data.";

    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Settings Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-bold">Failed to load settings data.</p>
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
            <h2 className="flex items-center gap-3 text-2xl font-black uppercase tracking-wide rw-text-shadow">
              <SettingsIcon className="h-6 w-6" />
              Core Config
            </h2>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              Configure only the paths and channels currently supported by the
              desktop backend.
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
            Auto Detect Paths
          </Button>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        {feedback ? (
          <output
            aria-live="polite"
            className={
              feedback.tone === "success"
                ? "rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-primary"
                : feedback.tone === "warning"
                  ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-700"
                  : "rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive"
            }
          >
            {feedback.message}
          </output>
        ) : null}

        {cachedBootstrap ? (
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Backend Capability Snapshot
              </CardTitle>
              <CardDescription>
                Values are read from the bootstrap payload instead of being
                hardcoded in the renderer.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  Supported Channels
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectableChannels.map((channel) => (
                    <Badge
                      key={channel}
                      variant="secondary"
                      className="uppercase"
                    >
                      {formatChannelLabel(channel)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  Runtime
                </p>
                <p className="text-sm font-bold">
                  {cachedBootstrap.environment.isWsl
                    ? `${cachedBootstrap.environment.platform} / WSL`
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
              <CardTitle className="text-base">Last Detection Result</CardTitle>
              <CardDescription>
                Candidate paths and selection state returned by the backend path
                detector.
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
                    ? "Manual selection required"
                    : "Preferred selection available"}
                </Badge>
                <Badge variant="outline">
                  {detectPathsMutation.data.candidates.length} candidates
                </Badge>
              </div>
              {detectPathsMutation.data.preferredSelection ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      Installation
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {detectPathsMutation.data.preferredSelection
                        .installationPath ?? "Not detected"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      Workshop
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {detectPathsMutation.data.preferredSelection
                        .workshopPath ?? "Not detected"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      Config
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {detectPathsMutation.data.preferredSelection.configPath ??
                        "Not detected"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                  Detection completed without a preferred selection.
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)}>
          <fieldset disabled={isBusy} className="space-y-6">
            <Card>
              <CardHeader className="bg-muted/50 py-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <HardDrive className="h-5 w-5" />
                  RimWorld Paths
                </CardTitle>
                <CardDescription className="font-bold">
                  Empty fields stay empty until the backend really detects or
                  persists them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-1.5">
                  <label
                    htmlFor="channel"
                    className="text-sm font-bold uppercase text-muted-foreground"
                  >
                    Distribution Channel
                  </label>
                  <select
                    id="channel"
                    className="flex h-10 w-full border-2 border-border bg-input px-3 py-2 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={draft.channel}
                    onChange={handleFieldChange("channel")}
                  >
                    {selectableChannels.map((channel) => (
                      <option key={channel} value={channel}>
                        {formatChannelLabel(channel)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="installationPath"
                    className="text-sm font-bold uppercase text-muted-foreground"
                  >
                    Installation Path
                  </label>
                  <Input
                    id="installationPath"
                    name="installationPath"
                    value={draft.installationPath}
                    onChange={handleFieldChange("installationPath")}
                    placeholder="C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld"
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="workshopPath"
                    className="text-sm font-bold uppercase text-muted-foreground"
                  >
                    Workshop Path
                  </label>
                  <Input
                    id="workshopPath"
                    name="workshopPath"
                    value={draft.workshopPath}
                    onChange={handleFieldChange("workshopPath")}
                    placeholder="C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\294100"
                    className="font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="configPath"
                    className="text-sm font-bold uppercase text-muted-foreground"
                  >
                    Config Path
                  </label>
                  <Input
                    id="configPath"
                    name="configPath"
                    value={draft.configPath}
                    onChange={handleFieldChange("configPath")}
                    placeholder="C:\\Users\\<name>\\AppData\\LocalLow\\Ludeon Studios\\RimWorld by Ludeon Studios\\Config"
                    className="font-mono"
                  />
                </div>
              </CardContent>
              <CardFooter className="justify-between bg-muted/50 py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  Save uses backend schema validation and repository
                  persistence.
                </div>
                <Button type="submit" className="w-32">
                  {saveSettingsMutation.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </CardFooter>
            </Card>
          </fieldset>
        </form>

        <ValidationCard validation={lastValidation} />
      </div>
    </div>
  );
}
