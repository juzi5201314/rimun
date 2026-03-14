import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type {
  LlmModelConfig,
  LlmProviderConfig,
  LlmSettings,
} from "@rimun/shared";
import type { LanguageModel } from "ai";

export type ResolvedLlmExecutionTarget = {
  provider: LlmProviderConfig;
  model: LlmModelConfig;
  languageModel: LanguageModel;
};

function requireProvider(settings: LlmSettings, providerId: string) {
  const provider = settings.providers.find((entry) => entry.id === providerId);

  if (!provider) {
    throw new Error(`LLM provider ${providerId} was not found.`);
  }

  if (!provider.enabled) {
    throw new Error(`LLM provider ${provider.name} is disabled.`);
  }

  if (!provider.apiKey.trim()) {
    throw new Error(`LLM provider ${provider.name} is missing an API key.`);
  }

  return provider;
}

function requireModel(provider: LlmProviderConfig, modelConfigId: string) {
  const model = provider.models.find((entry) => entry.id === modelConfigId);

  if (!model) {
    throw new Error(
      `LLM model ${modelConfigId} was not found in provider ${provider.name}.`,
    );
  }

  if (!model.enabled) {
    throw new Error(`LLM model ${model.label || model.modelId} is disabled.`);
  }

  if (!model.modelId.trim()) {
    throw new Error(`LLM model ${model.id} is missing a model id.`);
  }

  return model;
}

function createLanguageModel(
  provider: LlmProviderConfig,
  model: LlmModelConfig,
) {
  switch (provider.format) {
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });

      return anthropic(model.modelId);
    }
    case "openai-chat": {
      const openai = createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });

      return openai.chat(model.modelId);
    }
    case "openai-responses": {
      const openai = createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });

      return openai.responses(model.modelId);
    }
    case "gemini": {
      const google = createGoogleGenerativeAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
      });

      return google(model.modelId);
    }
  }
}

export function resolveLlmExecutionTarget(
  settings: LlmSettings,
  selection: {
    providerId: string;
    modelConfigId: string;
  },
): ResolvedLlmExecutionTarget {
  const provider = requireProvider(settings, selection.providerId);
  const model = requireModel(provider, selection.modelConfigId);

  return {
    provider,
    model,
    languageModel: createLanguageModel(provider, model),
  };
}
