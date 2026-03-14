import { describe, expect, it } from "bun:test";
import type { LlmSettings } from "@rimun/shared";
import { resolveLlmExecutionTarget } from "./runtime";

const baseSettings: LlmSettings = {
  providers: [
    {
      id: "provider-1",
      name: "Anthropic Primary",
      format: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "secret-key",
      enabled: true,
      models: [
        {
          id: "model-1",
          modelId: "claude-sonnet-4-5-20250929",
          label: "Claude Sonnet 4.5",
          enabled: true,
          metadata: null,
          metadataSelection: null,
          lastMetadataRefreshAt: null,
        },
      ],
    },
  ],
  updatedAt: "2026-03-14T12:00:00.000Z",
};
const baseProvider = baseSettings.providers[0];

if (!baseProvider) {
  throw new Error("Expected a base LLM provider fixture.");
}

describe("resolveLlmExecutionTarget", () => {
  it("creates an AI SDK language model for a configured provider/model", () => {
    const resolved = resolveLlmExecutionTarget(baseSettings, {
      providerId: "provider-1",
      modelConfigId: "model-1",
    });

    expect(resolved.provider.name).toBe("Anthropic Primary");
    expect(resolved.model.modelId).toBe("claude-sonnet-4-5-20250929");
    expect(resolved.languageModel).toBeDefined();
  });

  it("rejects disabled or incomplete selections", () => {
    expect(() =>
      resolveLlmExecutionTarget(
        {
          ...baseSettings,
          providers: [
            {
              ...baseProvider,
              enabled: false,
            },
          ],
        },
        {
          providerId: "provider-1",
          modelConfigId: "model-1",
        },
      ),
    ).toThrow("disabled");

    expect(() =>
      resolveLlmExecutionTarget(
        {
          ...baseSettings,
          providers: [
            {
              ...baseProvider,
              apiKey: "",
            },
          ],
        },
        {
          providerId: "provider-1",
          modelConfigId: "model-1",
        },
      ),
    ).toThrow("missing an API key");
  });
});
