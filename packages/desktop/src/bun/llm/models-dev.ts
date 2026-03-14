import type {
  LlmModelMetadata,
  LlmModelMetadataMatch,
  SearchModelMetadataInput,
  SearchModelMetadataResult,
} from "@rimun/shared";
import type { SettingsRepository } from "../persistence";

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type ModelsDevModelRecord = {
  id?: string;
  name?: string;
  family?: string;
  tool_call?: boolean;
  reasoning?: boolean;
  structured_output?: boolean;
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache_read?: number;
    cache_write?: number;
  };
  release_date?: string;
  last_updated?: string;
};

type ModelsDevProviderRecord = {
  id?: string;
  api?: string;
  name?: string;
  models?: Record<string, ModelsDevModelRecord | undefined>;
};

type ModelsDevIndex = Record<string, ModelsDevProviderRecord | undefined>;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function normalizeModelId(modelId: string) {
  return modelId.trim().toLowerCase();
}

function isCacheFresh(fetchedAt: string, now = Date.now()) {
  const fetchedAtMs = Date.parse(fetchedAt);

  if (Number.isNaN(fetchedAtMs)) {
    return false;
  }

  return now - fetchedAtMs < MODELS_DEV_CACHE_TTL_MS;
}

function parseModelsDevIndex(payloadJson: string): ModelsDevIndex {
  const parsed = JSON.parse(payloadJson);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("models.dev returned an invalid provider index.");
  }

  return parsed as ModelsDevIndex;
}

function toModelMetadata(model: ModelsDevModelRecord): LlmModelMetadata {
  return {
    contextLimit: model.limit?.context ?? null,
    inputLimit: model.limit?.input ?? null,
    outputLimit: model.limit?.output ?? null,
    supportsToolCall: model.tool_call ?? false,
    supportsReasoning: model.reasoning ?? false,
    supportsStructuredOutput: model.structured_output ?? false,
    releaseDate: model.release_date ?? null,
    lastUpdated: model.last_updated ?? null,
    pricing: model.cost
      ? {
          inputCostPerMillion: model.cost.input ?? null,
          outputCostPerMillion: model.cost.output ?? null,
          reasoningCostPerMillion: model.cost.reasoning ?? null,
          cacheReadCostPerMillion: model.cost.cache_read ?? null,
          cacheWriteCostPerMillion: model.cost.cache_write ?? null,
        }
      : null,
  };
}

function toMatch(
  providerId: string,
  provider: ModelsDevProviderRecord,
  modelId: string,
  model: ModelsDevModelRecord,
): LlmModelMetadataMatch {
  return {
    sourceProviderId: provider.id ?? providerId,
    sourceProviderName: provider.name ?? provider.id ?? providerId,
    sourceProviderApi: provider.api ?? null,
    modelId: model.id ?? modelId,
    modelName: model.name ?? null,
    family: model.family ?? null,
    metadata: toModelMetadata(model),
  };
}

export async function loadModelsDevIndex(
  repository: SettingsRepository,
  options: {
    fetchImpl?: FetchLike;
    forceRefresh?: boolean;
    now?: number;
  } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cached = repository.getModelsDevCache();

  if (
    cached &&
    !options.forceRefresh &&
    isCacheFresh(cached.fetchedAt, options.now)
  ) {
    return {
      fetchedAt: cached.fetchedAt,
      index: parseModelsDevIndex(cached.payloadJson),
    };
  }

  const response = await fetchImpl(MODELS_DEV_API_URL);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models.dev metadata (${response.status}).`,
    );
  }

  const payloadJson = await response.text();
  const saved = repository.saveModelsDevCache(payloadJson);

  return {
    fetchedAt: saved.fetchedAt,
    index: parseModelsDevIndex(saved.payloadJson),
  };
}

export async function searchModelMetadata(
  repository: SettingsRepository,
  input: SearchModelMetadataInput,
  options: {
    fetchImpl?: FetchLike;
    forceRefresh?: boolean;
    now?: number;
  } = {},
): Promise<SearchModelMetadataResult> {
  const query = input.modelId.trim();
  const normalizedQuery = normalizeModelId(query);
  const { fetchedAt, index } = await loadModelsDevIndex(repository, options);
  const matches: LlmModelMetadataMatch[] = [];

  for (const [providerId, provider] of Object.entries(index)) {
    if (!provider?.models) {
      continue;
    }

    for (const [modelId, model] of Object.entries(provider.models)) {
      if (!model) {
        continue;
      }

      const candidateModelId = model.id ?? modelId;

      if (normalizeModelId(candidateModelId) !== normalizedQuery) {
        continue;
      }

      matches.push(toMatch(providerId, provider, modelId, model));
    }
  }

  matches.sort((left, right) => {
    const providerCompare = left.sourceProviderName.localeCompare(
      right.sourceProviderName,
    );

    if (providerCompare !== 0) {
      return providerCompare;
    }

    return (left.modelName ?? left.modelId).localeCompare(
      right.modelName ?? right.modelId,
    );
  });

  return {
    query,
    cachedAt: fetchedAt,
    matches,
  };
}
