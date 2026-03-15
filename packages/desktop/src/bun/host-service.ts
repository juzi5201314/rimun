import type {
  ApplyActivePackageIdsInput,
  BootstrapPayload,
  CreateProfileInput,
  DeleteProfileInput,
  DetectPathsInput,
  ModProfileSummary,
  ModSourceSnapshot,
  ProfileScopedInput,
  RenameProfileInput,
  RimunHostApi,
  SaveProfileInput,
  SaveProfileResult,
  SaveSettingsInput,
  SaveSettingsResult,
  SwitchProfileInput,
  ValidatePathInput,
  ValidatePathResult,
} from "@rimun/shared";
import { rimunRpcSchemas } from "@rimun/shared";
import {
  createReadablePathResolver,
  readActivePackageIdsFromSelection,
  readModSourceSnapshot,
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

function toProfileSummary(
  profile: SaveProfileResult | ReturnType<SettingsRepository["getProfile"]>,
): ModProfileSummary {
  return {
    id: profile.id,
    name: profile.name,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function resolvePreferredSelection(repository: SettingsRepository) {
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

function resolveBootstrap(repository: SettingsRepository): BootstrapPayload {
  const settings = repository.getSettings();

  return rimunRpcSchemas.bun.requests.getBootstrap.response.parse({
    environment: getExecutionEnvironment(),
    settings,
    supportedChannels: ["steam", "manual"],
    preferredSelection: resolvePreferredSelection(repository),
  });
}

type CreateRimunHostServiceOptions = {
  readModSourceSnapshot?: typeof readModSourceSnapshot;
  toReadablePath?: (windowsPath: string) => string | null;
};

function createSnapshotRequestKey(args: {
  activePackageIds: string[];
  profileId: string;
  selection: ReturnType<typeof resolvePreferredSelection>;
}) {
  const { activePackageIds, profileId, selection } = args;

  return JSON.stringify({
    activePackageIds,
    configPath: selection?.configPath ?? null,
    installationPath: selection?.installationPath ?? null,
    profileId,
    workshopPath: selection?.workshopPath ?? null,
  });
}

export function createRimunHostService(
  repository: SettingsRepository,
  options: CreateRimunHostServiceOptions = {},
): RimunHostApi {
  const toReadablePath = options.toReadablePath ?? createReadablePathResolver();
  const readModSourceSnapshotImpl =
    options.readModSourceSnapshot ?? readModSourceSnapshot;
  const snapshotRequestsInFlight = new Map<
    string,
    Promise<ModSourceSnapshot>
  >();

  async function getModSourceSnapshotSingleFlight(profileId: string) {
    const profile = await resolveStoredProfile(
      repository,
      profileId,
      toReadablePath,
    );
    const selection = resolvePreferredSelection(repository);
    const requestKey = createSnapshotRequestKey({
      activePackageIds: profile.activePackageIds,
      profileId,
      selection,
    });
    const existingRequest = snapshotRequestsInFlight.get(requestKey);

    if (existingRequest) {
      return existingRequest;
    }

    const request = readModSourceSnapshotImpl(selection, {
      activePackageIdsOverride: profile.activePackageIds,
      toReadablePath,
    }).finally(() => {
      if (snapshotRequestsInFlight.get(requestKey) === request) {
        snapshotRequestsInFlight.delete(requestKey);
      }
    });

    snapshotRequestsInFlight.set(requestKey, request);

    return request;
  }

  return {
    getBootstrap: async () => resolveBootstrap(repository),
    getProfileCatalog: async () =>
      rimunRpcSchemas.bun.requests.getProfileCatalog.response.parse(
        await ensureProfileCatalog(repository, toReadablePath),
      ),
    createProfile: async (payload: CreateProfileInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.createProfile.params,
        payload,
      );
      const initialActivePackageIds =
        await resolveInitialProfileActivePackageIds(repository, toReadablePath);

      return rimunRpcSchemas.bun.requests.createProfile.response.parse(
        repository.createProfile(input, initialActivePackageIds),
      );
    },
    renameProfile: async (payload: RenameProfileInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.renameProfile.params,
        payload,
      );
      const initialActivePackageIds =
        await resolveInitialProfileActivePackageIds(repository, toReadablePath);

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
        await resolveInitialProfileActivePackageIds(repository, toReadablePath);
      const profile = repository.saveProfile(input, initialActivePackageIds);
      const currentProfileId = repository.getCurrentProfileId();
      const selection = resolvePreferredSelection(repository);

      if (input.applyToGame && currentProfileId === input.profileId) {
        writeActiveModsToConfig(selection, profile.activePackageIds, {
          toReadablePath,
        });
      }

      return rimunRpcSchemas.bun.requests.saveProfile.response.parse(
        toProfileSummary(profile),
      );
    },
    deleteProfile: async (payload: DeleteProfileInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.deleteProfile.params,
        payload,
      );
      const initialActivePackageIds =
        await resolveInitialProfileActivePackageIds(repository, toReadablePath);
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

      return rimunRpcSchemas.bun.requests.deleteProfile.response.parse(catalog);
    },
    switchProfile: async (payload: SwitchProfileInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.switchProfile.params,
        payload,
      );
      const initialActivePackageIds =
        await resolveInitialProfileActivePackageIds(repository, toReadablePath);
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

      return rimunRpcSchemas.bun.requests.switchProfile.response.parse(catalog);
    },
    getModSourceSnapshot: async (payload: ProfileScopedInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.getModSourceSnapshot.params,
        payload,
      );

      return rimunRpcSchemas.bun.requests.getModSourceSnapshot.response.parse(
        await getModSourceSnapshotSingleFlight(input.profileId),
      );
    },
    getSettings: async () =>
      rimunRpcSchemas.bun.requests.getSettings.response.parse(
        repository.getSettings(),
      ),
    saveSettings: async (payload: SaveSettingsInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.saveSettings.params,
        payload,
      );
      const settings = repository.saveSettings(input);
      const validation: ValidatePathResult[] = [
        validatePath({
          kind: "installation",
          channel: settings.channel,
          windowsPath: input.installationPath,
        }),
      ];

      if (settings.workshopPath) {
        validation.push(
          validatePath({
            kind: "workshop",
            channel: settings.channel,
            windowsPath: settings.workshopPath,
          }),
        );
      }

      if (settings.configPath) {
        validation.push(
          validatePath({
            kind: "config",
            channel: settings.channel,
            windowsPath: settings.configPath,
          }),
        );
      }

      return rimunRpcSchemas.bun.requests.saveSettings.response.parse({
        settings,
        validation,
      } satisfies SaveSettingsResult);
    },
    detectPaths: async (payload: DetectPathsInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.detectPaths.params,
        payload,
      );

      return rimunRpcSchemas.bun.requests.detectPaths.response.parse(
        detectPaths(input),
      );
    },
    validatePath: async (payload: ValidatePathInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.validatePath.params,
        payload,
      );

      return rimunRpcSchemas.bun.requests.validatePath.response.parse(
        validatePath(input),
      );
    },
    applyActivePackageIds: async (payload: ApplyActivePackageIdsInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.applyActivePackageIds.params,
        payload,
      );
      const initialActivePackageIds =
        await resolveInitialProfileActivePackageIds(repository, toReadablePath);
      const currentProfile = repository.getProfile(
        input.profileId,
        initialActivePackageIds,
      );
      const profile = repository.saveProfile(
        {
          profileId: input.profileId,
          name: currentProfile.name,
          activePackageIds: input.activePackageIds,
          applyToGame: input.applyToGame,
        },
        initialActivePackageIds,
      );
      const currentProfileId = repository.getCurrentProfileId(
        initialActivePackageIds,
      );

      if (input.applyToGame && currentProfileId === input.profileId) {
        writeActiveModsToConfig(
          resolvePreferredSelection(repository),
          profile.activePackageIds,
          {
            toReadablePath,
          },
        );
      }

      return rimunRpcSchemas.bun.requests.applyActivePackageIds.response.parse(
        toProfileSummary(profile),
      );
    },
  };
}
