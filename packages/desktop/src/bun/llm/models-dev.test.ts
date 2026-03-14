import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsRepository } from "../persistence";
import { searchModelMetadata } from "./models-dev";

function createRepository() {
  process.env["RIMUN_APP_DATA_DIR"] = mkdtempSync(
    join(tmpdir(), "rimun-models-dev-test-"),
  );

  return new SettingsRepository();
}

function cleanupRepository(repository: SettingsRepository) {
  repository.close();
  delete process.env["RIMUN_APP_DATA_DIR"];
}

describe("models.dev search", () => {
  it("returns multiple matches for the same model id from cached metadata", async () => {
    const repository = createRepository();

    repository.saveModelsDevCache(
      JSON.stringify({
        anthropic: {
          id: "anthropic",
          name: "Anthropic",
          api: "https://api.anthropic.com/v1",
          models: {
            "claude-sonnet-4-5-20250929": {
              id: "claude-sonnet-4-5-20250929",
              name: "Claude Sonnet 4.5",
              family: "claude-sonnet",
              tool_call: true,
              reasoning: true,
              structured_output: false,
              limit: {
                context: 200000,
                output: 64000,
              },
            },
          },
        },
        aihubmix: {
          id: "aihubmix",
          name: "AIHubMix",
          api: "https://api.aihubmix.example/v1",
          models: {
            "claude-sonnet-4-5-20250929": {
              id: "claude-sonnet-4-5-20250929",
              name: "Claude Sonnet 4.5",
              family: "claude-sonnet",
              tool_call: true,
              reasoning: true,
              structured_output: true,
              limit: {
                context: 200000,
                output: 64000,
              },
            },
          },
        },
      }),
    );

    const result = await searchModelMetadata(repository, {
      modelId: "claude-sonnet-4-5-20250929",
    });

    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]?.sourceProviderName).toBe("AIHubMix");
    expect(result.matches[1]?.sourceProviderName).toBe("Anthropic");

    cleanupRepository(repository);
  });

  it("refreshes stale cache from the remote index", async () => {
    const repository = createRepository();

    repository.saveModelsDevCache(JSON.stringify({ stale: true }));

    const result = await searchModelMetadata(
      repository,
      {
        modelId: "gemini-2.5-flash",
      },
      {
        now: Date.parse("2026-03-20T00:00:00.000Z"),
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              google: {
                id: "google",
                name: "Google",
                api: "https://generativelanguage.googleapis.com/v1beta",
                models: {
                  "gemini-2.5-flash": {
                    id: "gemini-2.5-flash",
                    name: "Gemini 2.5 Flash",
                    family: "gemini-flash",
                    tool_call: true,
                    reasoning: true,
                    structured_output: true,
                    limit: {
                      context: 1048576,
                      output: 65536,
                    },
                  },
                },
              },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          ),
      },
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.metadata.contextLimit).toBe(1048576);
    expect(repository.getModelsDevCache()?.payloadJson).toContain(
      "gemini-2.5-flash",
    );

    cleanupRepository(repository);
  });
});
