import { useLlmSettingsQuery } from "@/features/settings/hooks/useLlmSettingsQuery";
import { useSaveLlmSettingsMutation } from "@/features/settings/hooks/useSaveLlmSettingsMutation";
import { useSearchModelMetadata } from "@/features/settings/hooks/useSearchModelMetadata";
import { AlertDialog } from "@/shared/components/ui/alert-dialog";
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
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import type {
  LlmApiFormat,
  LlmModelConfig,
  LlmModelMetadataMatch,
  LlmProviderConfig,
  LlmSettings,
} from "@rimun/shared";
import {
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const formatOptions: Array<{ value: LlmApiFormat; label: string }> = [
  { value: "anthropic", label: "Anthropic / Claude" },
  { value: "openai-chat", label: "OpenAI Chat" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "gemini", label: "Gemini" },
];

const defaultBaseUrls: Record<LlmApiFormat, string> = {
  anthropic: "https://api.anthropic.com/v1",
  "openai-chat": "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};

type FeedbackTone = "success" | "error" | "warning";

type FeedbackState = {
  tone: FeedbackTone;
  message: string;
} | null;

type SearchState = {
  pending: boolean;
  error: string | null;
};

type MetadataDialogState = {
  providerId: string;
  modelConfigId: string;
  query: string;
  matches: LlmModelMetadataMatch[];
  selectedIndex: number;
};

type ModelEditorRowProps = {
  model: LlmModelConfig;
  searchState: SearchState | undefined;
  onUpdate: (updater: (current: LlmModelConfig) => LlmModelConfig) => void;
  onRemove: () => void;
  onRefreshMetadata: () => void;
  onAutoFetchMetadata: (modelId: string) => void;
};

function createDraftId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultProvider(index: number): LlmProviderConfig {
  return {
    id: createDraftId(),
    name: `Provider ${index}`,
    format: "anthropic",
    baseUrl: defaultBaseUrls.anthropic,
    apiKey: "",
    enabled: true,
    models: [],
  };
}

function createDefaultModel(index: number): LlmModelConfig {
  return {
    id: createDraftId(),
    modelId: "",
    label: `Model ${index}`,
    enabled: true,
    metadata: null,
    metadataSelection: null,
    lastMetadataRefreshAt: null,
  };
}

function feedbackClassName(tone: FeedbackTone) {
  switch (tone) {
    case "success":
      return "rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary";
    case "warning":
      return "rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700";
    case "error":
      return "rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive";
  }
}

function formatLimit(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}

function ModelEditorRow({
  model,
  searchState,
  onUpdate,
  onRemove,
  onRefreshMetadata,
  onAutoFetchMetadata,
}: ModelEditorRowProps) {
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const nextModelId = model.modelId.trim();

    if (!nextModelId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onAutoFetchMetadata(nextModelId);
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [model.modelId, onAutoFetchMetadata]);

  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold">
              {model.label || "Unnamed model"}
            </p>
            <Badge variant={model.enabled ? "default" : "outline"}>
              {model.enabled ? "Enabled" : "Disabled"}
            </Badge>
            {model.metadata ? (
              <Badge variant="secondary">Metadata cached</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Model ID changes trigger automatic metadata lookup via models.dev.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefreshMetadata}
            disabled={searchState?.pending || !model.modelId.trim()}
          >
            {searchState?.pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh metadata
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
        <div className="space-y-1.5">
          <label
            htmlFor={`llm-model-label-${model.id}`}
            className="text-sm font-bold uppercase text-muted-foreground"
          >
            Label
          </label>
          <Input
            id={`llm-model-label-${model.id}`}
            value={model.label}
            onChange={(event) => {
              const nextValue = event.target.value;
              onUpdate((current) => ({
                ...current,
                label: nextValue,
              }));
            }}
            placeholder="Friendly model label"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`llm-model-id-${model.id}`}
            className="text-sm font-bold uppercase text-muted-foreground"
          >
            Model ID
          </label>
          <Input
            id={`llm-model-id-${model.id}`}
            value={model.modelId}
            onChange={(event) => {
              const nextValue = event.target.value;
              onUpdate((current) => ({
                ...current,
                modelId: nextValue,
                metadata: null,
                metadataSelection: null,
                lastMetadataRefreshAt: null,
              }));
            }}
            placeholder="claude-sonnet-4-5-20250929"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <label
          htmlFor={`llm-model-enabled-${model.id}`}
          className="mt-7 flex items-center gap-2 text-sm font-medium"
        >
          <Checkbox
            id={`llm-model-enabled-${model.id}`}
            checked={model.enabled}
            onChange={(event) => {
              onUpdate((current) => ({
                ...current,
                enabled: event.target.checked,
              }));
            }}
          />
          Enabled
        </label>
      </div>

      {searchState?.error ? (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          {searchState.error}
        </div>
      ) : null}

      {model.metadata ? (
        <div className="mt-4 space-y-3 rounded-xl border border-border/60 bg-card/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              Context {formatLimit(model.metadata.contextLimit)}
            </Badge>
            <Badge variant="outline">
              Input {formatLimit(model.metadata.inputLimit)}
            </Badge>
            <Badge variant="outline">
              Output {formatLimit(model.metadata.outputLimit)}
            </Badge>
            {model.metadata.supportsToolCall ? (
              <Badge variant="secondary">Tool calling</Badge>
            ) : null}
            {model.metadata.supportsReasoning ? (
              <Badge variant="secondary">Reasoning</Badge>
            ) : null}
            {model.metadata.supportsStructuredOutput ? (
              <Badge variant="secondary">Structured output</Badge>
            ) : null}
          </div>
          <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
            <p>
              Metadata source:{" "}
              {model.metadataSelection?.sourceProviderName ?? "Unknown"}
            </p>
            <p>
              Refreshed: {model.lastMetadataRefreshAt ?? "Not refreshed yet"}
            </p>
            <p>Release: {model.metadata.releaseDate ?? "Unknown"}</p>
            <p>Updated: {model.metadata.lastUpdated ?? "Unknown"}</p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No metadata cached yet. Enter a model ID and pause briefly, or click
          refresh.
        </p>
      )}
    </div>
  );
}

export function LlmSettingsSection() {
  const llmSettingsQuery = useLlmSettingsQuery();
  const saveLlmSettingsMutation = useSaveLlmSettingsMutation();
  const searchModelMetadata = useSearchModelMetadata();
  const [draft, setDraft] = useState<LlmSettings>({
    providers: [],
    updatedAt: null,
  });
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [metadataDialog, setMetadataDialog] =
    useState<MetadataDialogState | null>(null);
  const [searchStateByKey, setSearchStateByKey] = useState<
    Record<string, SearchState>
  >({});
  const [apiKeyVisibilityByProviderId, setApiKeyVisibilityByProviderId] =
    useState<Record<string, boolean>>({});
  const searchRequestIdsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!llmSettingsQuery.data) {
      return;
    }

    setDraft(llmSettingsQuery.data);
    setActiveProviderId((currentActiveProviderId) => {
      if (
        currentActiveProviderId &&
        llmSettingsQuery.data.providers.some(
          (provider) => provider.id === currentActiveProviderId,
        )
      ) {
        return currentActiveProviderId;
      }

      return llmSettingsQuery.data.providers[0]?.id ?? null;
    });
  }, [llmSettingsQuery.data]);

  const activeProvider = draft.providers.find(
    (provider) => provider.id === activeProviderId,
  );
  const hasPendingSearch = Object.values(searchStateByKey).some(
    (entry) => entry.pending,
  );
  const isBusy =
    llmSettingsQuery.isPending ||
    saveLlmSettingsMutation.isPending ||
    hasPendingSearch;

  function setProviderDraft(
    providerId: string,
    updater: (current: LlmProviderConfig) => LlmProviderConfig,
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      providers: currentDraft.providers.map((provider) =>
        provider.id === providerId ? updater(provider) : provider,
      ),
    }));
  }

  function setModelDraft(
    providerId: string,
    modelConfigId: string,
    updater: (current: LlmModelConfig) => LlmModelConfig,
  ) {
    setProviderDraft(providerId, (provider) => ({
      ...provider,
      models: provider.models.map((model) =>
        model.id === modelConfigId ? updater(model) : model,
      ),
    }));
  }

  function applyMetadataSelection(
    providerId: string,
    modelConfigId: string,
    match: LlmModelMetadataMatch,
  ) {
    setModelDraft(providerId, modelConfigId, (model) => ({
      ...model,
      metadata: match.metadata,
      metadataSelection: {
        sourceProviderId: match.sourceProviderId,
        sourceProviderName: match.sourceProviderName,
      },
      lastMetadataRefreshAt: new Date().toISOString(),
    }));
  }

  async function requestMetadata(
    providerId: string,
    modelConfigId: string,
    modelId: string,
  ) {
    const query = modelId.trim();
    const requestKey = `${providerId}:${modelConfigId}`;
    const nextRequestId = (searchRequestIdsRef.current[requestKey] ?? 0) + 1;
    searchRequestIdsRef.current[requestKey] = nextRequestId;

    if (!query) {
      setSearchStateByKey((current) => ({
        ...current,
        [requestKey]: {
          pending: false,
          error: null,
        },
      }));
      return;
    }

    setSearchStateByKey((current) => ({
      ...current,
      [requestKey]: {
        pending: true,
        error: null,
      },
    }));

    try {
      const result = await searchModelMetadata({ modelId: query });

      if (searchRequestIdsRef.current[requestKey] !== nextRequestId) {
        return;
      }

      if (result.matches.length === 0) {
        setSearchStateByKey((current) => ({
          ...current,
          [requestKey]: {
            pending: false,
            error: `No models.dev metadata match was found for ${query}.`,
          },
        }));
        return;
      }

      if (result.matches.length === 1) {
        const firstMatch = result.matches[0];

        if (!firstMatch) {
          throw new Error("Expected a metadata match.");
        }

        applyMetadataSelection(providerId, modelConfigId, firstMatch);
        setSearchStateByKey((current) => ({
          ...current,
          [requestKey]: {
            pending: false,
            error: null,
          },
        }));
        return;
      }

      setMetadataDialog({
        providerId,
        modelConfigId,
        query,
        matches: result.matches,
        selectedIndex: 0,
      });
      setSearchStateByKey((current) => ({
        ...current,
        [requestKey]: {
          pending: false,
          error: `${result.matches.length} metadata matches found. Choose one source.`,
        },
      }));
    } catch (error) {
      setSearchStateByKey((current) => ({
        ...current,
        [requestKey]: {
          pending: false,
          error:
            error instanceof Error ? error.message : "Metadata lookup failed.",
        },
      }));
    }
  }

  function addProvider() {
    setFeedback(null);
    setDraft((currentDraft) => {
      const nextProvider = createDefaultProvider(
        currentDraft.providers.length + 1,
      );

      setActiveProviderId(nextProvider.id);

      return {
        ...currentDraft,
        providers: [...currentDraft.providers, nextProvider],
      };
    });
  }

  function removeProvider(providerId: string) {
    setFeedback(null);
    setDraft((currentDraft) => {
      const nextProviders = currentDraft.providers.filter(
        (provider) => provider.id !== providerId,
      );

      setActiveProviderId((currentActiveProviderId) => {
        if (currentActiveProviderId !== providerId) {
          return currentActiveProviderId;
        }

        return nextProviders[0]?.id ?? null;
      });

      return {
        ...currentDraft,
        providers: nextProviders,
      };
    });
  }

  function addModel(providerId: string) {
    setFeedback(null);
    setProviderDraft(providerId, (provider) => ({
      ...provider,
      models: [
        ...provider.models,
        createDefaultModel(provider.models.length + 1),
      ],
    }));
  }

  function removeModel(providerId: string, modelConfigId: string) {
    setFeedback(null);
    setProviderDraft(providerId, (provider) => ({
      ...provider,
      models: provider.models.filter((model) => model.id !== modelConfigId),
    }));
  }

  async function handleSave() {
    setFeedback(null);

    try {
      const saved = await saveLlmSettingsMutation.mutateAsync({
        providers: draft.providers,
      });

      setDraft(saved);
      setFeedback({
        tone: "success",
        message: "LLM settings saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Saving LLM settings failed.",
      });
    }
  }

  if (llmSettingsQuery.isError) {
    const message =
      llmSettingsQuery.error instanceof Error
        ? llmSettingsQuery.error.message
        : "Failed to load LLM settings.";

    return (
      <Card className="border-destructive/60 bg-destructive/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="h-5 w-5" />
            LLM Settings Error
          </CardTitle>
          <CardDescription className="text-destructive/80">
            {message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {feedback ? (
          <output
            aria-live="polite"
            className={feedbackClassName(feedback.tone)}
          >
            {feedback.message}
          </output>
        ) : null}

        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              LLM Providers
            </CardTitle>
            <CardDescription>
              Configure reusable LLM providers and models for future AI
              features. Translation is not wired yet, but the runtime contract
              is ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-background/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Formats
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {formatOptions.map((option) => (
                  <Badge key={option.value} variant="secondary">
                    {option.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Metadata
              </p>
              <p className="mt-3 text-sm text-foreground/90">
                Model context and output limits are fetched from models.dev and
                cached locally.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Storage
              </p>
              <p className="mt-3 text-sm text-foreground/90">
                API keys are currently stored in the local app database as plain
                text.
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Current Config
              </p>
              <p className="mt-3 text-sm font-bold">
                {draft.providers.length} provider
                {draft.providers.length === 1 ? "" : "s"}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                Provider List
                <Button type="button" size="sm" onClick={addProvider}>
                  <Plus className="h-4 w-4" />
                  Add Provider
                </Button>
              </CardTitle>
              <CardDescription>
                Providers hold auth, base URL, and their model catalog.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {draft.providers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-background/70 p-6 text-sm text-muted-foreground">
                  No LLM providers configured yet.
                </div>
              ) : (
                draft.providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                      provider.id === activeProviderId
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/60 bg-background/70 hover:bg-accent/40"
                    }`}
                    onClick={() => setActiveProviderId(provider.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">{provider.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatOptions.find(
                            (option) => option.value === provider.format,
                          )?.label ?? provider.format}
                        </p>
                      </div>
                      <Badge variant={provider.enabled ? "default" : "outline"}>
                        {provider.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {provider.models.length} model
                      {provider.models.length === 1 ? "" : "s"}
                    </p>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {activeProvider ? (
            <Card className="border-border/60 bg-card/60">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Server className="h-5 w-5" />
                      {activeProvider.name}
                    </CardTitle>
                    <CardDescription>
                      Configure the provider transport first, then add one or
                      more models underneath.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeProvider(activeProvider.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove Provider
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`llm-provider-name-${activeProvider.id}`}
                      className="text-sm font-bold uppercase text-muted-foreground"
                    >
                      Provider Name
                    </label>
                    <Input
                      id={`llm-provider-name-${activeProvider.id}`}
                      value={activeProvider.name}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setFeedback(null);
                        setProviderDraft(activeProvider.id, (provider) => ({
                          ...provider,
                          name: nextValue,
                        }));
                      }}
                      placeholder="Anthropic Primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`llm-provider-format-${activeProvider.id}`}
                      className="text-sm font-bold uppercase text-muted-foreground"
                    >
                      API Format
                    </label>
                    <select
                      id={`llm-provider-format-${activeProvider.id}`}
                      className="flex h-10 w-full border-2 border-border bg-input px-3 py-2 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={activeProvider.format}
                      onChange={(event) => {
                        const nextFormat = event.target.value as LlmApiFormat;
                        setFeedback(null);
                        setProviderDraft(activeProvider.id, (provider) => ({
                          ...provider,
                          format: nextFormat,
                          baseUrl: defaultBaseUrls[nextFormat],
                        }));
                      }}
                    >
                      {formatOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`llm-provider-base-url-${activeProvider.id}`}
                      className="text-sm font-bold uppercase text-muted-foreground"
                    >
                      Base URL
                    </label>
                    <Input
                      id={`llm-provider-base-url-${activeProvider.id}`}
                      value={activeProvider.baseUrl}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setFeedback(null);
                        setProviderDraft(activeProvider.id, (provider) => ({
                          ...provider,
                          baseUrl: nextValue,
                        }));
                      }}
                      className="font-mono"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`llm-provider-api-key-${activeProvider.id}`}
                      className="text-sm font-bold uppercase text-muted-foreground"
                    >
                      API Key
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id={`llm-provider-api-key-${activeProvider.id}`}
                        type={
                          apiKeyVisibilityByProviderId[activeProvider.id]
                            ? "text"
                            : "password"
                        }
                        value={activeProvider.apiKey}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setFeedback(null);
                          setProviderDraft(activeProvider.id, (provider) => ({
                            ...provider,
                            apiKey: nextValue,
                          }));
                        }}
                        placeholder="sk-..."
                        className="font-mono"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setApiKeyVisibilityByProviderId((current) => ({
                            ...current,
                            [activeProvider.id]: !current[activeProvider.id],
                          }));
                        }}
                        aria-label={
                          apiKeyVisibilityByProviderId[activeProvider.id]
                            ? "Hide API Key"
                            : "Show API Key"
                        }
                      >
                        {apiKeyVisibilityByProviderId[activeProvider.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <label
                    htmlFor={`llm-provider-enabled-${activeProvider.id}`}
                    className="mt-7 flex items-center gap-2 text-sm font-medium"
                  >
                    <Checkbox
                      id={`llm-provider-enabled-${activeProvider.id}`}
                      checked={activeProvider.enabled}
                      onChange={(event) => {
                        setProviderDraft(activeProvider.id, (provider) => ({
                          ...provider,
                          enabled: event.target.checked,
                        }));
                      }}
                    />
                    Enabled
                  </label>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold">Configured Models</h3>
                      <p className="text-sm text-muted-foreground">
                        Each provider can expose multiple models for later
                        manual selection.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => addModel(activeProvider.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Add Model
                    </Button>
                  </div>

                  {activeProvider.models.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/70 p-6 text-sm text-muted-foreground">
                      No models configured for this provider yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeProvider.models.map((model) => {
                        const requestKey = `${activeProvider.id}:${model.id}`;

                        return (
                          <ModelEditorRow
                            key={model.id}
                            model={model}
                            searchState={searchStateByKey[requestKey]}
                            onUpdate={(updater) => {
                              setFeedback(null);
                              setModelDraft(
                                activeProvider.id,
                                model.id,
                                updater,
                              );
                            }}
                            onRemove={() =>
                              removeModel(activeProvider.id, model.id)
                            }
                            onRefreshMetadata={() =>
                              void requestMetadata(
                                activeProvider.id,
                                model.id,
                                model.modelId,
                              )
                            }
                            onAutoFetchMetadata={(nextModelId) =>
                              void requestMetadata(
                                activeProvider.id,
                                model.id,
                                nextModelId,
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap justify-between gap-3 bg-muted/50 py-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  Save stores provider credentials, models, and metadata
                  snapshots.
                </div>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isBusy}
                >
                  {saveLlmSettingsMutation.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save LLM Config
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card className="border-border/60 bg-card/60">
              <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center">
                <Bot className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-2">
                  <p className="text-lg font-bold">
                    Create your first provider
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Add Anthropic, OpenAI, or Gemini credentials first, then
                    attach models underneath.
                  </p>
                </div>
                <Button type="button" onClick={addProvider}>
                  <Plus className="h-4 w-4" />
                  Add Provider
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog
        open={metadataDialog !== null}
        title="Choose Metadata Source"
        description={
          metadataDialog
            ? `models.dev returned multiple matches for ${metadataDialog.query}. Pick the source whose limits best match the provider you are configuring.`
            : undefined
        }
        confirmLabel="Use Selected Metadata"
        cancelLabel="Dismiss"
        onCancel={() => setMetadataDialog(null)}
        onConfirm={() => {
          if (!metadataDialog) {
            return;
          }

          const selectedMatch =
            metadataDialog.matches[metadataDialog.selectedIndex];

          if (!selectedMatch) {
            return;
          }

          applyMetadataSelection(
            metadataDialog.providerId,
            metadataDialog.modelConfigId,
            selectedMatch,
          );
          setMetadataDialog(null);
        }}
      >
        <div className="space-y-3">
          {metadataDialog?.matches.map((match, index) => (
            <label
              key={`${match.sourceProviderId}:${match.modelId}:${index}`}
              className="flex cursor-pointer gap-3 rounded-xl border border-border/60 bg-background/70 p-4"
            >
              <input
                type="radio"
                name="metadata-source"
                checked={metadataDialog.selectedIndex === index}
                onChange={() => {
                  setMetadataDialog((current) =>
                    current
                      ? {
                          ...current,
                          selectedIndex: index,
                        }
                      : current,
                  );
                }}
                className="mt-1"
              />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">
                    {match.sourceProviderName} /{" "}
                    {match.modelName ?? match.modelId}
                  </p>
                  {match.family ? (
                    <Badge variant="outline">{match.family}</Badge>
                  ) : null}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {match.modelId}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">
                    Context {formatLimit(match.metadata.contextLimit)}
                  </Badge>
                  <Badge variant="outline">
                    Output {formatLimit(match.metadata.outputLimit)}
                  </Badge>
                  {match.metadata.supportsToolCall ? (
                    <Badge variant="secondary">Tool calling</Badge>
                  ) : null}
                  {match.metadata.supportsReasoning ? (
                    <Badge variant="secondary">Reasoning</Badge>
                  ) : null}
                </div>
                {match.sourceProviderApi ? (
                  <p className="text-xs text-muted-foreground">
                    Source API: {match.sourceProviderApi}
                  </p>
                ) : null}
              </div>
            </label>
          ))}
        </div>
      </AlertDialog>
    </>
  );
}
