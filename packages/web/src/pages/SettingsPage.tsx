import { useDetectPathsMutation } from "@/features/settings/hooks/useDetectPathsMutation";
import { useSaveSettingsMutation } from "@/features/settings/hooks/useSaveSettingsMutation";
import { useSettingsQuery } from "@/features/settings/hooks/useSettingsQuery";
import type { AppSettings, SaveSettingsInput } from "@rimun/shared";
import { useEffect, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent } from "react";

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
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const savedSettings = await saveSettingsMutation.mutateAsync(draft);

    startTransition(() => {
      setDraft(toFormState(savedSettings.settings));
      setStatusMessage("Settings saved.");
    });
  }

  if (settingsQuery.isError) {
    return <p role="alert">Failed to load settings.</p>;
  }

  return (
    <section aria-labelledby="settings-heading">
      <h2 id="settings-heading">Settings</h2>
      <p>Configure RimWorld paths. Styling will be added later.</p>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <fieldset disabled={isBusy}>
          <legend>RimWorld paths</legend>

          <p>
            <button
              type="button"
              onClick={() => void handleAutoDetect()}
              aria-label="Auto detect paths"
            >
              Auto detect paths
            </button>
          </p>

          <p>
            <label>
              Distribution channel
              <select
                value={draft.channel}
                onChange={handleFieldChange("channel")}
              >
                <option value="steam">steam</option>
                <option value="manual">manual</option>
              </select>
            </label>
          </p>

          <p>
            <label>
              RimWorld install directory
              <input
                name="installationPath"
                value={draft.installationPath}
                onChange={handleFieldChange("installationPath")}
              />
            </label>
          </p>

          <p>
            <label>
              Workshop directory
              <input
                name="workshopPath"
                value={draft.workshopPath ?? ""}
                onChange={handleFieldChange("workshopPath")}
              />
            </label>
          </p>

          <p>
            <label>
              Config directory
              <input
                name="configPath"
                value={draft.configPath ?? ""}
                onChange={handleFieldChange("configPath")}
              />
            </label>
          </p>

          <p>
            <button type="submit">Save settings</button>
          </p>
        </fieldset>
      </form>

      {statusMessage ? <output>{statusMessage}</output> : null}

      {detectPathsMutation.data?.errors.length ? (
        <>
          <h3>Detection warnings</h3>
          <ul>
            {detectPathsMutation.data.errors.map((error) => (
              <li key={error.message}>{error.message}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
