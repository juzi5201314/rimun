import type {
  ApplyModOrderRecommendationInput,
  CreateProfileInput,
  DeleteProfileInput,
  DetectPathsInput,
  PathSelection,
  ProfileScopedInput,
  RimunRpcContract,
  SaveProfileInput,
  SaveSettingsInput,
  SwitchProfileInput,
} from "@rimun/shared";
import { rimunRpcSchemas } from "@rimun/shared";
import { BrowserView } from "electrobun/bun";
import {
  analyzeModOrderFromSelection,
  applyModOrderRecommendation,
} from "./mod-order";
import {
  createReadablePathResolver,
  readActivePackageIdsFromSelection,
  scanModLibrary,
  writeActiveModsToConfig,
} from "./mods";
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

async function resolveInitialProfileActivePackageIds(
  repository: SettingsRepository,
  toReadablePath: (windowsPath: string) => string | null,
) {
  return readActivePackageIdsFromSelection(
    resolvePreferredSelection(repository),
    {
      toReadablePath,
    },
  );
}

async function ensureProfileCatalog(
  repository: SettingsRepository,
  toReadablePath: (windowsPath: string) => string | null,
) {
  const initialActivePackageIds = await resolveInitialProfileActivePackageIds(
    repository,
    toReadablePath,
  );

  return repository.getProfileCatalog(initialActivePackageIds);
}

async function resolveStoredProfile(
  repository: SettingsRepository,
  profileId: string,
  toReadablePath: (windowsPath: string) => string | null,
) {
  const initialActivePackageIds = await resolveInitialProfileActivePackageIds(
    repository,
    toReadablePath,
  );

  return repository.getProfile(profileId, initialActivePackageIds);
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
  const toReadablePath = createReadablePathResolver();

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
        getProfileCatalog: async (params) => {
          assertRequestSchema(
            rimunRpcSchemas.bun.requests.getProfileCatalog.params,
            params,
          );

          return rimunRpcSchemas.bun.requests.getProfileCatalog.response.parse(
            await ensureProfileCatalog(repository, toReadablePath),
          );
        },
        createProfile: async (payload: CreateProfileInput) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.createProfile.params,
            payload,
          );
          const initialActivePackageIds =
            await resolveInitialProfileActivePackageIds(
              repository,
              toReadablePath,
            );

          return rimunRpcSchemas.bun.requests.createProfile.response.parse(
            repository.createProfile(input, initialActivePackageIds),
          );
        },
        renameProfile: async (payload) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.renameProfile.params,
            payload,
          );
          const initialActivePackageIds =
            await resolveInitialProfileActivePackageIds(
              repository,
              toReadablePath,
            );

          return rimunRpcSchemas.bun.requests.renameProfile.response.parse(
            repository.renameProfile(
              input.profileId,
              input.name,
              initialActivePackageIds,
            ),
          );
        },
        saveProfile: async (payload: SaveProfileInput) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.saveProfile.params,
            payload,
          );
          const initialActivePackageIds =
            await resolveInitialProfileActivePackageIds(
              repository,
              toReadablePath,
            );
          const profile = repository.saveProfile(
            input,
            initialActivePackageIds,
          );
          const currentProfileId = repository.getCurrentProfileId();
          const selection = resolvePreferredSelection(repository);

          if (input.applyToGame && currentProfileId === input.profileId) {
            writeActiveModsToConfig(selection, profile.activePackageIds, {
              toReadablePath,
            });
          }

          const modLibrary = await scanModLibrary(selection, {
            activePackageIdsOverride: profile.activePackageIds,
            toReadablePath,
          });
          const analysis = await analyzeModOrderFromSelection(
            selection,
            profile.activePackageIds,
            {
              toReadablePath,
            },
          );

          return rimunRpcSchemas.bun.requests.saveProfile.response.parse({
            profile,
            modLibrary,
            analysis,
          });
        },
        deleteProfile: async (payload: DeleteProfileInput) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.deleteProfile.params,
            payload,
          );
          const initialActivePackageIds =
            await resolveInitialProfileActivePackageIds(
              repository,
              toReadablePath,
            );
          const previousCurrentProfileId = repository.getCurrentProfileId(
            initialActivePackageIds,
          );
          const catalog = repository.deleteProfile(
            input.profileId,
            initialActivePackageIds,
          );

          if (previousCurrentProfileId === input.profileId) {
            const nextCurrentProfile = repository.getCurrentProfile(
              initialActivePackageIds,
            );
            writeActiveModsToConfig(
              resolvePreferredSelection(repository),
              nextCurrentProfile.activePackageIds,
              {
                toReadablePath,
              },
            );
          }

          return rimunRpcSchemas.bun.requests.deleteProfile.response.parse(
            catalog,
          );
        },
        switchProfile: async (payload: SwitchProfileInput) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.switchProfile.params,
            payload,
          );
          const initialActivePackageIds =
            await resolveInitialProfileActivePackageIds(
              repository,
              toReadablePath,
            );
          const catalog = repository.switchProfile(
            input.profileId,
            initialActivePackageIds,
          );
          const nextCurrentProfile = repository.getProfile(
            input.profileId,
            initialActivePackageIds,
          );

          writeActiveModsToConfig(
            resolvePreferredSelection(repository),
            nextCurrentProfile.activePackageIds,
            {
              toReadablePath,
            },
          );

          return rimunRpcSchemas.bun.requests.switchProfile.response.parse(
            catalog,
          );
        },
        getModLibrary: async (payload: ProfileScopedInput) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.getModLibrary.params,
            payload,
          );
          const profile = await resolveStoredProfile(
            repository,
            input.profileId,
            toReadablePath,
          );

          return rimunRpcSchemas.bun.requests.getModLibrary.response.parse(
            await scanModLibrary(resolvePreferredSelection(repository), {
              activePackageIdsOverride: profile.activePackageIds,
              toReadablePath,
            }),
          );
        },
        analyzeModOrder: async (payload: ProfileScopedInput) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.analyzeModOrder.params,
            payload,
          );
          const profile = await resolveStoredProfile(
            repository,
            input.profileId,
            toReadablePath,
          );

          return rimunRpcSchemas.bun.requests.analyzeModOrder.response.parse(
            await analyzeModOrderFromSelection(
              resolvePreferredSelection(repository),
              profile.activePackageIds,
              {
                toReadablePath,
              },
            ),
          );
        },
        applyModOrderRecommendation: async (
          payload: ApplyModOrderRecommendationInput,
        ) => {
          const input = assertRequestSchema(
            rimunRpcSchemas.bun.requests.applyModOrderRecommendation.params,
            payload,
          );
          const profile = await resolveStoredProfile(
            repository,
            input.profileId,
            toReadablePath,
          );
          const result = await applyModOrderRecommendation(
            resolvePreferredSelection(repository),
            input,
            profile.activePackageIds,
            {
              toReadablePath,
            },
          );
          const updatedProfile = repository.saveProfile(
            {
              profileId: profile.id,
              name: profile.name,
              activePackageIds: result.activePackageIds,
              applyToGame: false,
            },
            result.activePackageIds,
          );

          if (repository.getCurrentProfileId() === profile.id) {
            writeActiveModsToConfig(
              resolvePreferredSelection(repository),
              updatedProfile.activePackageIds,
              {
                toReadablePath,
              },
            );
          }

          return rimunRpcSchemas.bun.requests.applyModOrderRecommendation.response.parse(
            result,
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
