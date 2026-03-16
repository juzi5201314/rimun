import type {
  ApplyActivePackageIdsInput,
  BootstrapPayload,
  CreateProfileInput,
  DeleteProfileInput,
  DetectPathsInput,
  ModLocalizationProgress,
  ModLocalizationProgressInput,
  ModLocalizationSnapshot,
  ModLocalizationSnapshotInput,
  ModProfileSummary,
  ModSourceSnapshot,
  ProfileScopedInput,
  RenameProfileInput,
  RimunHostApi,
  SaveLlmSettingsInput,
  SaveProfileInput,
  SaveProfileResult,
  SaveSettingsInput,
  SaveSettingsResult,
  SearchModelMetadataInput,
  SwitchProfileInput,
  ValidatePathInput,
  ValidatePathResult,
} from "@rimun/shared";
import { rimunRpcSchemas } from "@rimun/shared";
import { loadI18nDictionaries } from "./i18n/dictionaries";
import { searchModelMetadata } from "./llm/models-dev";
import {
  createReadablePathResolver,
  readActivePackageIdsFromSelection,
  readModLocalizationSnapshotForSnapshot,
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
  readModLocalizationSnapshotForSnapshot?: typeof readModLocalizationSnapshotForSnapshot;
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

function createLocalizationRequestKey(args: {
  activePackageIds: string[];
  profileId: string;
  selection: ReturnType<typeof resolvePreferredSelection>;
  snapshotScannedAt: string;
}) {
  return JSON.stringify({
    activePackageIds: args.activePackageIds,
    configPath: args.selection?.configPath ?? null,
    installationPath: args.selection?.installationPath ?? null,
    profileId: args.profileId,
    snapshotScannedAt: args.snapshotScannedAt,
    workshopPath: args.selection?.workshopPath ?? null,
  });
}

function createPendingLocalizationProgress(
  snapshot: ModSourceSnapshot,
): ModLocalizationProgress {
  return {
    completedUnits: 0,
    percent: 0,
    scannedAt: snapshot.scannedAt,
    state: "pending",
    totalUnits: 1 + snapshot.entries.length * 2,
  };
}

function createCompletedLocalizationProgress(
  snapshot: ModSourceSnapshot,
  previous: ModLocalizationProgress | undefined,
): ModLocalizationProgress {
  return {
    completedUnits: previous?.totalUnits ?? 1 + snapshot.entries.length * 2,
    percent: 100,
    scannedAt: snapshot.scannedAt,
    state: "complete",
    totalUnits: previous?.totalUnits ?? 1 + snapshot.entries.length * 2,
  };
}

function createUnavailableLocalizationProgress(
  snapshot: ModSourceSnapshot,
): ModLocalizationProgress {
  return {
    completedUnits: 0,
    percent: 0,
    scannedAt: snapshot.scannedAt,
    state: "unavailable",
    totalUnits: 1 + snapshot.entries.length * 2,
  };
}

type SnapshotRequestContext = {
  profileId: string;
  profileActivePackageIds: string[];
  requestKey: string;
  selection: ReturnType<typeof resolvePreferredSelection>;
};

type LocalizationAnalysisFailure = {
  error: unknown;
};

export function createRimunHostService(
  repository: SettingsRepository,
  options: CreateRimunHostServiceOptions = {},
): RimunHostApi {
  const toReadablePath = options.toReadablePath ?? createReadablePathResolver();
  const readModLocalizationSnapshotForSnapshotImpl =
    options.readModLocalizationSnapshotForSnapshot ??
    readModLocalizationSnapshotForSnapshot;
  const readModSourceSnapshotImpl =
    options.readModSourceSnapshot ?? readModSourceSnapshot;
  const snapshotRequestsInFlight = new Map<
    string,
    Promise<ModSourceSnapshot>
  >();
  const latestSnapshots = new Map<string, ModSourceSnapshot>();
  const localizationRequestsInFlight = new Map<
    string,
    Promise<ModLocalizationSnapshot>
  >();
  const latestLocalizations = new Map<string, ModLocalizationSnapshot>();
  const latestLocalizationFailures = new Map<
    string,
    LocalizationAnalysisFailure
  >();
  const latestLocalizationProgress = new Map<string, ModLocalizationProgress>();

  function resolveStoredLocalizationFailure(args: {
    localizationRequestKey: string;
    snapshotScannedAt: string;
  }) {
    const failure = latestLocalizationFailures.get(args.localizationRequestKey);

    if (failure?.error instanceof Error) {
      return failure.error;
    }

    return new Error(
      `Localization analysis is unavailable for snapshot ${args.snapshotScannedAt}.`,
    );
  }

  function startLocalizationAnalysisInBackground(args: {
    context: SnapshotRequestContext;
    snapshot: ModSourceSnapshot;
  }) {
    void startLocalizationAnalysis(args).catch(() => {});
  }

  async function resolveSnapshotRequestContext(
    profileId: string,
  ): Promise<SnapshotRequestContext> {
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

    return {
      profileActivePackageIds: profile.activePackageIds,
      profileId,
      requestKey,
      selection,
    };
  }

  function startLocalizationAnalysis(args: {
    context: SnapshotRequestContext;
    snapshot: ModSourceSnapshot;
  }) {
    const localizationRequestKey = createLocalizationRequestKey({
      activePackageIds: args.context.profileActivePackageIds,
      profileId: args.context.profileId,
      selection: args.context.selection,
      snapshotScannedAt: args.snapshot.scannedAt,
    });
    const existingLocalization = latestLocalizations.get(
      localizationRequestKey,
    );

    if (existingLocalization) {
      latestLocalizationProgress.set(
        localizationRequestKey,
        createCompletedLocalizationProgress(
          args.snapshot,
          latestLocalizationProgress.get(localizationRequestKey),
        ),
      );
      return Promise.resolve(existingLocalization);
    }

    const existingFailure = latestLocalizationFailures.get(
      localizationRequestKey,
    );

    if (existingFailure) {
      latestLocalizationProgress.set(
        localizationRequestKey,
        createUnavailableLocalizationProgress(args.snapshot),
      );
      return Promise.reject(
        resolveStoredLocalizationFailure({
          localizationRequestKey,
          snapshotScannedAt: args.snapshot.scannedAt,
        }),
      );
    }

    const existingRequest = localizationRequestsInFlight.get(
      localizationRequestKey,
    );

    if (existingRequest) {
      return existingRequest;
    }

    latestLocalizationProgress.set(
      localizationRequestKey,
      createPendingLocalizationProgress(args.snapshot),
    );

    const request = readModLocalizationSnapshotForSnapshotImpl(args.snapshot, {
      onProgress: (progress) => {
        latestLocalizationProgress.set(localizationRequestKey, {
          ...progress,
          scannedAt: args.snapshot.scannedAt,
          state: "pending",
        });
      },
      toReadablePath,
    })
      .then((localizationSnapshot) => {
        latestLocalizations.set(localizationRequestKey, localizationSnapshot);
        latestLocalizationFailures.delete(localizationRequestKey);
        latestLocalizationProgress.set(
          localizationRequestKey,
          createCompletedLocalizationProgress(
            args.snapshot,
            latestLocalizationProgress.get(localizationRequestKey),
          ),
        );
        return localizationSnapshot;
      })
      .catch((error) => {
        latestLocalizationFailures.set(localizationRequestKey, {
          error,
        });
        latestLocalizationProgress.set(
          localizationRequestKey,
          createUnavailableLocalizationProgress(args.snapshot),
        );
        console.error("Localization analysis failed for mod snapshot.", {
          error,
          localizationRequestKey,
          snapshotScannedAt: args.snapshot.scannedAt,
        });
        throw error;
      })
      .finally(() => {
        if (
          localizationRequestsInFlight.get(localizationRequestKey) === request
        ) {
          localizationRequestsInFlight.delete(localizationRequestKey);
        }
      });

    localizationRequestsInFlight.set(localizationRequestKey, request);

    return request;
  }

  async function getModLocalizationProgressSingleFlight(
    input: ModLocalizationProgressInput,
  ) {
    const context = await resolveSnapshotRequestContext(input.profileId);
    const localizationRequestKey = createLocalizationRequestKey({
      activePackageIds: context.profileActivePackageIds,
      profileId: context.profileId,
      selection: context.selection,
      snapshotScannedAt: input.snapshotScannedAt,
    });
    const cachedSnapshot = latestSnapshots.get(context.requestKey);
    const cachedLocalization = latestLocalizations.get(localizationRequestKey);

    if (cachedSnapshot?.scannedAt === input.snapshotScannedAt) {
      if (cachedLocalization) {
        return createCompletedLocalizationProgress(
          cachedSnapshot,
          latestLocalizationProgress.get(localizationRequestKey),
        );
      }

      const existingProgress = latestLocalizationProgress.get(
        localizationRequestKey,
      );

      if (existingProgress?.state === "unavailable") {
        return existingProgress;
      }

      startLocalizationAnalysisInBackground({
        context,
        snapshot: cachedSnapshot,
      });

      return (
        latestLocalizationProgress.get(localizationRequestKey) ??
        createPendingLocalizationProgress(cachedSnapshot)
      );
    }

    const latestSnapshot = await getModSourceSnapshotSingleFlight(
      input.profileId,
    );

    if (latestSnapshot.scannedAt !== input.snapshotScannedAt) {
      throw new Error(
        "The requested mod snapshot is stale. Reload the mod source snapshot before requesting localization progress.",
      );
    }

    if (cachedLocalization) {
      return createCompletedLocalizationProgress(
        latestSnapshot,
        latestLocalizationProgress.get(localizationRequestKey),
      );
    }

    const existingProgress = latestLocalizationProgress.get(
      localizationRequestKey,
    );

    if (existingProgress?.state === "unavailable") {
      return existingProgress;
    }

    startLocalizationAnalysisInBackground({
      context,
      snapshot: latestSnapshot,
    });

    return (
      latestLocalizationProgress.get(localizationRequestKey) ??
      createPendingLocalizationProgress(latestSnapshot)
    );
  }

  async function getModSourceSnapshotSingleFlight(profileId: string) {
    const context = await resolveSnapshotRequestContext(profileId);
    const existingRequest = snapshotRequestsInFlight.get(context.requestKey);

    if (existingRequest) {
      return existingRequest;
    }

    const request = readModSourceSnapshotImpl(context.selection, {
      activePackageIdsOverride: context.profileActivePackageIds,
      toReadablePath,
    })
      .then((snapshot) => {
        latestSnapshots.set(context.requestKey, snapshot);
        startLocalizationAnalysisInBackground({
          context,
          snapshot,
        });
        return snapshot;
      })
      .finally(() => {
        if (snapshotRequestsInFlight.get(context.requestKey) === request) {
          snapshotRequestsInFlight.delete(context.requestKey);
        }
      });

    snapshotRequestsInFlight.set(context.requestKey, request);

    return request;
  }

  async function getModLocalizationSnapshotSingleFlight(
    input: ModLocalizationSnapshotInput,
  ) {
    const context = await resolveSnapshotRequestContext(input.profileId);
    const localizationRequestKey = createLocalizationRequestKey({
      activePackageIds: context.profileActivePackageIds,
      profileId: context.profileId,
      selection: context.selection,
      snapshotScannedAt: input.snapshotScannedAt,
    });
    const existingLocalization = latestLocalizations.get(
      localizationRequestKey,
    );

    if (existingLocalization) {
      return existingLocalization;
    }

    if (
      latestLocalizationProgress.get(localizationRequestKey)?.state ===
      "unavailable"
    ) {
      throw resolveStoredLocalizationFailure({
        localizationRequestKey,
        snapshotScannedAt: input.snapshotScannedAt,
      });
    }

    const existingRequest = localizationRequestsInFlight.get(
      localizationRequestKey,
    );

    if (existingRequest) {
      return existingRequest;
    }

    const cachedSnapshot = latestSnapshots.get(context.requestKey);

    if (cachedSnapshot?.scannedAt === input.snapshotScannedAt) {
      return startLocalizationAnalysis({
        context,
        snapshot: cachedSnapshot,
      });
    }

    const latestSnapshot = await getModSourceSnapshotSingleFlight(
      input.profileId,
    );

    if (latestSnapshot.scannedAt !== input.snapshotScannedAt) {
      throw new Error(
        "The requested mod snapshot is stale. Reload the mod source snapshot before requesting localization data.",
      );
    }

    return startLocalizationAnalysis({
      context,
      snapshot: latestSnapshot,
    });
  }

  return {
    getBootstrap: async () => resolveBootstrap(repository),
    getI18nDictionaries: async () => loadI18nDictionaries(),
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
    getModLocalizationSnapshot: async (
      payload: ModLocalizationSnapshotInput,
    ) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.getModLocalizationSnapshot.params,
        payload,
      );

      return rimunRpcSchemas.bun.requests.getModLocalizationSnapshot.response.parse(
        await getModLocalizationSnapshotSingleFlight(input),
      );
    },
    getModLocalizationProgress: async (
      payload: ModLocalizationProgressInput,
    ) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.getModLocalizationProgress.params,
        payload,
      );

      return rimunRpcSchemas.bun.requests.getModLocalizationProgress.response.parse(
        await getModLocalizationProgressSingleFlight(input),
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
    getLlmSettings: async () =>
      rimunRpcSchemas.bun.requests.getLlmSettings.response.parse(
        repository.getLlmSettings(),
      ),
    saveLlmSettings: async (payload: SaveLlmSettingsInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.saveLlmSettings.params,
        payload,
      );

      return rimunRpcSchemas.bun.requests.saveLlmSettings.response.parse(
        repository.saveLlmSettings(input),
      );
    },
    searchModelMetadata: async (payload: SearchModelMetadataInput) => {
      const input = assertRequestSchema(
        rimunRpcSchemas.bun.requests.searchModelMetadata.params,
        payload,
      );

      return rimunRpcSchemas.bun.requests.searchModelMetadata.response.parse(
        await searchModelMetadata(repository, input),
      );
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
