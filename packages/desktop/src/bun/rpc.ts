import type {
  DetectPathsInput,
  PathSelection,
  RimunRpcContract,
  SaveSettingsInput,
} from "@rimun/shared";
import { rimunRpcSchemas } from "@rimun/shared";
import { BrowserView } from "electrobun/bun";
import { scanModLibrary } from "./mods";
import type { SettingsRepository } from "./persistence";
import { detectPaths, getExecutionEnvironment, validatePath } from "./platform";

function assertRequestSchema<T>(
  schema: { parse(value: unknown): T },
  value: unknown,
) {
  return schema.parse(value);
}

function resolvePreferredSelection(
  repository: SettingsRepository,
): PathSelection | null {
  const settings = repository.getSettings();

  if (settings.installationPath) {
    return {
      channel: settings.channel,
      installationPath: settings.installationPath,
      workshopPath: settings.workshopPath,
      configPath: settings.configPath,
    };
  }

  return detectPaths({
    preferredChannels: ["steam"],
    allowFallbackToManual: true,
  }).preferredSelection;
}

function resolveBootstrap(repository: SettingsRepository) {
  const settings = repository.getSettings();

  return rimunRpcSchemas.bun.requests.getBootstrap.response.parse({
    environment: getExecutionEnvironment(),
    settings,
    supportedChannels: ["steam", "manual"],
    preferredSelection: resolvePreferredSelection(repository),
  });
}

export function createMainWindowRpc(
  repository: SettingsRepository,
  _getWindow: () => unknown,
) {
  return BrowserView.defineRPC<RimunRpcContract>({
    maxRequestTime: 30_000,
    handlers: {
      requests: {
        getBootstrap: (params) => {
          assertRequestSchema(
            rimunRpcSchemas.bun.requests.getBootstrap.params,
            params,
          );
          return resolveBootstrap(repository);
        },
        getModLibrary: async (params) => {
          assertRequestSchema(
            rimunRpcSchemas.bun.requests.getModLibrary.params,
            params,
          );

          return rimunRpcSchemas.bun.requests.getModLibrary.response.parse(
            await scanModLibrary(resolvePreferredSelection(repository)),
          );
        },
        getSettings: (params) => {
          assertRequestSchema(
            rimunRpcSchemas.bun.requests.getSettings.params,
            params,
          );
          return rimunRpcSchemas.bun.requests.getSettings.response.parse(
            repository.getSettings(),
          );
        },
        saveSettings: (payload: SaveSettingsInput) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.saveSettings.params,
            payload,
          );
          const settings = repository.saveSettings(input);
          const validation = [
            validatePath({
              kind: "installation",
              channel: input.channel,
              windowsPath: input.installationPath,
            }),
            ...(input.workshopPath
              ? [
                  validatePath({
                    kind: "workshop",
                    channel: input.channel,
                    windowsPath: input.workshopPath,
                  }),
                ]
              : []),
            ...(input.configPath
              ? [
                  validatePath({
                    kind: "config",
                    channel: input.channel,
                    windowsPath: input.configPath,
                  }),
                ]
              : []),
          ];
          const result =
            rimunRpcSchemas.bun.requests.saveSettings.response.parse({
              settings,
              validation,
            });

          return result;
        },
        detectPaths: (payload: DetectPathsInput) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.detectPaths.params,
            payload,
          );
          const result =
            rimunRpcSchemas.bun.requests.detectPaths.response.parse(
              detectPaths(input),
            );

          return result;
        },
        validatePath: (payload) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.validatePath.params,
            payload,
          );

          return rimunRpcSchemas.bun.requests.validatePath.response.parse(
            validatePath(input),
          );
        },
      },
      messages: {},
    },
  });
}
