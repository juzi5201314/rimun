import { useDetectPathsMutation } from "@/features/settings/hooks/useDetectPathsMutation";
import { useSaveSettingsMutation } from "@/features/settings/hooks/useSaveSettingsMutation";
import { useSettingsQuery } from "@/features/settings/hooks/useSettingsQuery";
import type { AppSettings, SaveSettingsInput } from "@rimun/shared";
import { useEffect, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { AlertTriangle, HardDrive, Settings as SettingsIcon, FolderSearch, CheckCircle2 } from "lucide-react";

const DEFAULT_INSTALLATION_PATH =
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RimWorld";

const EMPTY_SETTINGS: SaveSettingsInput = {
  channel: "steam",
  installationPath: DEFAULT_INSTALLATION_PATH,
  workshopPath: null,
  configPath: null,
};

function toFormState(
  settings: AppSettings | SaveSettingsInput,
): SaveSettingsInput {
  return {
    channel: settings.channel,
    installationPath: settings.installationPath ?? DEFAULT_INSTALLATION_PATH,
    workshopPath: settings.workshopPath,
    configPath: settings.configPath,
  };
}

export function SettingsPage() {
  const settingsQuery = useSettingsQuery();
  const detectPathsMutation = useDetectPathsMutation();
  const saveSettingsMutation = useSaveSettingsMutation();
  const [draft, setDraft] = useState<SaveSettingsInput>(EMPTY_SETTINGS);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isTransitionPending, startTransition] = useTransition();

  useEffect(() => {
    if (settingsQuery.data) {
      setDraft(toFormState(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const isBusy =
    settingsQuery.isPending ||
    detectPathsMutation.isPending ||
    saveSettingsMutation.isPending ||
    isTransitionPending;

  function handleFieldChange(field: keyof SaveSettingsInput) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const nextValue = event.target.value;

      setDraft((currentDraft) => ({
        ...currentDraft,
        [field]:
          field === "workshopPath" || field === "configPath"
            ? nextValue || null
            : nextValue,
      }));
    };
  }

  async function handleAutoDetect() {
    const detection = await detectPathsMutation.mutateAsync();

    if (detection.preferredSelection) {
      setDraft({
        channel: detection.preferredSelection.channel,
        installationPath:
          detection.preferredSelection.installationPath ??
          DEFAULT_INSTALLATION_PATH,
        workshopPath: detection.preferredSelection.workshopPath,
        configPath: detection.preferredSelection.configPath,
      });
    }

    startTransition(() => {
      setStatusMessage("Automatic path detection finished.");
      setTimeout(() => setStatusMessage(null), 3000);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const savedSettings = await saveSettingsMutation.mutateAsync(draft);

    startTransition(() => {
      setDraft(toFormState(savedSettings.settings));
      setStatusMessage("Settings saved successfully.");
      setTimeout(() => setStatusMessage(null), 3000);
    });
  }

  if (settingsQuery.isError) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <Card className="max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle />
              Settings Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Failed to load settings data.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="p-8 border-b border-border bg-card flex justify-between items-center sticky top-0 z-10">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <SettingsIcon className="w-8 h-8 text-primary" />
            System Settings
          </h2>
          <p className="text-muted-foreground text-sm mt-1">Configure paths and system integrations.</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => void handleAutoDetect()} 
          disabled={isBusy}
          className="gap-2"
        >
          <FolderSearch className="w-4 h-4" />
          Auto Detect Paths
        </Button>
      </div>

      <div className="p-8 max-w-4xl w-full space-y-6">
        {statusMessage && (
          <div className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-md text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {statusMessage}
          </div>
        )}

        {detectPathsMutation.data?.errors.length ? (
          <Card className="border-destructive bg-destructive/5">
            <CardHeader className="py-3 border-b border-destructive/20">
              <CardTitle className="text-destructive text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Detection Warnings
              </CardTitle>
            </CardHeader>
            <CardContent className="py-4">
              <ul className="list-disc pl-5 text-sm text-destructive space-y-1">
                {detectPathsMutation.data.errors.map((error) => (
                  <li key={error.message}>{error.message}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)}>
          <fieldset disabled={isBusy} className="space-y-6">
            <Card shadow-sm>
              <CardHeader className="bg-muted/30">
                <CardTitle className="text-xl flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  RimWorld Paths
                </CardTitle>
                <CardDescription>
                  Configure where RimWorld and its data are located on your system.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Distribution Channel</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={draft.channel}
                    onChange={handleFieldChange("channel")}
                  >
                    <option value="steam">Steam</option>
                    <option value="manual">Manual / GoG</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Installation Directory</label>
                  <Input
                    name="installationPath"
                    value={draft.installationPath}
                    onChange={handleFieldChange("installationPath")}
                    placeholder="e.g., C:\Program Files (x86)\Steam\steamapps\common\RimWorld"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Workshop Directory</label>
                  <Input
                    name="workshopPath"
                    value={draft.workshopPath ?? ""}
                    onChange={handleFieldChange("workshopPath")}
                    placeholder="e.g., C:\Program Files (x86)\Steam\steamapps\workshop\content\294100"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">Config Directory</label>
                  <Input
                    name="configPath"
                    value={draft.configPath ?? ""}
                    onChange={handleFieldChange("configPath")}
                    placeholder="Leave empty for default appdata path"
                  />
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 py-4 flex justify-end">
                <Button type="submit" className="min-w-[100px]">
                  Save Changes
                </Button>
              </CardFooter>
            </Card>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
