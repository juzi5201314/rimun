import { join, win32 } from "node:path";
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
import { hasDirtyModLocalizationSessionState } from "./mod-localization";
import {
  createReadablePathResolver,
  readActivePackageIdsFromSelection,
  readModLocalizationSnapshotForSnapshot,
  readModSourceSnapshot,
  writeActiveModsToConfig,
} from "./mods";
import type { SettingsRepository } from "./persistence";
import { detectPaths, getExecutionEnvironment, validatePath } from "./platform";
import { createWatchGroup, type WatchGroup } from "./watch-group";

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
  if (repository.hasAnyProfiles()) {
    return repository.getProfileCatalog();
  }

  const initialActivePackageIds = await resolveInitialProfileActivePackageIds(
    repository,
    toReadablePath,
  );

  return repository.getProfileCatalog(initialActivePackageIds);
}

function toPublicModSourceSnapshot(
  snapshot: ModSourceSnapshot,
): ModSourceSnapshot {
  return {
    ...snapshot,
    entries: snapshot.entries.map(
      ({ aboutXmlText: _aboutXmlText, ...entry }) => ({
        ...entry,
      }),
    ),
  };
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

function createMonotonicIsoTimestamp(previousIso: string) {
  const previousMs = Date.parse(previousIso);
  const nextMs = Date.now();
  const safePreviousMs = Number.isFinite(previousMs) ? previousMs : 0;

  return new Date(Math.max(nextMs, safePreviousMs + 1)).toISOString();
}

function createRefreshedSnapshot(
  snapshot: ModSourceSnapshot,
): ModSourceSnapshot {
  return {
    ...snapshot,
    scannedAt: createMonotonicIsoTimestamp(snapshot.scannedAt),
  };
}

function extractProfileIdFromRequestKey(requestKey: string) {
  const parsed = JSON.parse(requestKey) as {
    profileId?: unknown;
  };

  return typeof parsed.profileId === "string" ? parsed.profileId : null;
}

function matchesProfileRequestKey(args: {
  profileId: string;
  requestKey: string;
}) {
  return extractProfileIdFromRequestKey(args.requestKey) === args.profileId;
}

function matchesLocalizationRequestScope(args: {
  localizationRequestKey: string;
  requestKey: string;
}) {
  const parsed = JSON.parse(args.localizationRequestKey) as {
    activePackageIds?: unknown;
    configPath?: unknown;
    installationPath?: unknown;
    profileId?: unknown;
    workshopPath?: unknown;
  };

  if (
    !Array.isArray(parsed.activePackageIds) ||
    typeof parsed.profileId !== "string"
  ) {
    return false;
  }

  return (
    createSnapshotRequestKey({
      activePackageIds: parsed.activePackageIds.filter(
        (value): value is string => typeof value === "string",
      ),
      profileId: parsed.profileId,
      selection: {
        channel: "steam",
        configPath:
          typeof parsed.configPath === "string" ? parsed.configPath : null,
        installationPath:
          typeof parsed.installationPath === "string"
            ? parsed.installationPath
            : null,
        workshopPath:
          typeof parsed.workshopPath === "string" ? parsed.workshopPath : null,
      },
    }) === args.requestKey
  );
}

function extractSnapshotScannedAtFromLocalizationRequestKey(
  localizationRequestKey: string,
) {
  const parsed = JSON.parse(localizationRequestKey) as {
    snapshotScannedAt?: unknown;
  };

  return typeof parsed.snapshotScannedAt === "string"
    ? parsed.snapshotScannedAt
    : null;
}

function areLocalizationRelevantEntriesEqual(
  left: ModSourceSnapshot["entries"][number] | undefined,
  right: ModSourceSnapshot["entries"][number] | undefined,
) {
  return (
    left?.entryName === right?.entryName &&
    left?.source === right?.source &&
    left?.modWindowsPath === right?.modWindowsPath &&
    left?.modReadablePath === right?.modReadablePath &&
    left?.manifestPath === right?.manifestPath &&
    left?.hasAboutXml === right?.hasAboutXml &&
    left?.aboutXmlText === right?.aboutXmlText
  );
}

function areSnapshotsLocalizationEquivalent(
  previousSnapshot: ModSourceSnapshot,
  nextSnapshot: ModSourceSnapshot,
) {
  if (previousSnapshot.gameVersion !== nextSnapshot.gameVersion) {
    return false;
  }

  if (
    previousSnapshot.currentGameLanguage.folderName !==
      nextSnapshot.currentGameLanguage.folderName ||
    previousSnapshot.currentGameLanguage.normalizedFolderName !==
      nextSnapshot.currentGameLanguage.normalizedFolderName ||
    previousSnapshot.currentGameLanguage.source !==
      nextSnapshot.currentGameLanguage.source
  ) {
    return false;
  }

  if (
    previousSnapshot.activePackageIds.length !==
    nextSnapshot.activePackageIds.length
  ) {
    return false;
  }

  for (
    let index = 0;
    index < previousSnapshot.activePackageIds.length;
    index += 1
  ) {
    if (
      previousSnapshot.activePackageIds[index] !==
      nextSnapshot.activePackageIds[index]
    ) {
      return false;
    }
  }

  if (previousSnapshot.entries.length !== nextSnapshot.entries.length) {
    return false;
  }

  for (let index = 0; index < previousSnapshot.entries.length; index += 1) {
    if (
      !areLocalizationRelevantEntriesEqual(
        previousSnapshot.entries[index],
        nextSnapshot.entries[index],
      )
    ) {
      return false;
    }
  }

  return true;
}

function createRefreshedLocalizationSnapshot(args: {
  localization: ModLocalizationSnapshot;
  scannedAt: string;
}): ModLocalizationSnapshot {
  return {
    ...args.localization,
    scannedAt: args.scannedAt,
  };
}

function createRefreshedLocalizationProgress(args: {
  progress: ModLocalizationProgress | undefined;
  scannedAt: string;
  totalUnits: number;
}): ModLocalizationProgress {
  return {
    completedUnits:
      args.progress?.completedUnits ??
      args.progress?.totalUnits ??
      args.totalUnits,
    percent: args.progress?.percent ?? 100,
    scannedAt: args.scannedAt,
    state: args.progress?.state ?? "complete",
    totalUnits: args.progress?.totalUnits ?? args.totalUnits,
  };
}

function closeSnapshotWatchState(state: SnapshotWatchState | undefined) {
  if (!state) {
    return;
  }

  state.rootWatchGroup?.close();

  for (const group of state.aboutWatchGroups) {
    group.close();
  }
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
  stateVersion: number;
};

type LocalizationAnalysisFailure = {
  error: unknown;
};

type SnapshotWatchState = {
  aboutWatchGroups: WatchGroup[];
  isDirty: boolean;
  rootWatchGroup: WatchGroup | null;
};

const pendingLocalizationBackgroundTimers = new Set<
  ReturnType<typeof setTimeout>
>();

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
  const latestSnapshotScannedAtByRequestKey = new Map<string, string>();
  const snapshotWatchStates = new Map<string, SnapshotWatchState>();
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
  const debugLocalizationCarryForward =
    process.env["RIMUN_DEBUG_LOCALIZATION_CARRY_FORWARD"] === "1";
  let snapshotStateVersion = 0;

  function clearLocalizationStateForRequestKey(requestKey: string) {
    for (const localizationRequestKey of localizationRequestsInFlight.keys()) {
      if (
        matchesLocalizationRequestScope({
          localizationRequestKey,
          requestKey,
        })
      ) {
        localizationRequestsInFlight.delete(localizationRequestKey);
      }
    }

    for (const localizationRequestKey of latestLocalizations.keys()) {
      if (
        matchesLocalizationRequestScope({
          localizationRequestKey,
          requestKey,
        })
      ) {
        latestLocalizations.delete(localizationRequestKey);
      }
    }

    for (const localizationRequestKey of latestLocalizationFailures.keys()) {
      if (
        matchesLocalizationRequestScope({
          localizationRequestKey,
          requestKey,
        })
      ) {
        latestLocalizationFailures.delete(localizationRequestKey);
      }
    }

    for (const localizationRequestKey of latestLocalizationProgress.keys()) {
      if (
        matchesLocalizationRequestScope({
          localizationRequestKey,
          requestKey,
        })
      ) {
        latestLocalizationProgress.delete(localizationRequestKey);
      }
    }
  }

  function clearSnapshotStateForRequestKey(requestKey: string) {
    closeSnapshotWatchState(snapshotWatchStates.get(requestKey));
    snapshotWatchStates.delete(requestKey);
    latestSnapshots.delete(requestKey);
    latestSnapshotScannedAtByRequestKey.delete(requestKey);
    snapshotRequestsInFlight.delete(requestKey);
    clearLocalizationStateForRequestKey(requestKey);
  }

  function clearSnapshotStateForProfile(profileId: string) {
    for (const requestKey of snapshotWatchStates.keys()) {
      if (matchesProfileRequestKey({ profileId, requestKey })) {
        clearSnapshotStateForRequestKey(requestKey);
      }
    }

    for (const requestKey of latestSnapshots.keys()) {
      if (matchesProfileRequestKey({ profileId, requestKey })) {
        clearSnapshotStateForRequestKey(requestKey);
      }
    }

    for (const requestKey of snapshotRequestsInFlight.keys()) {
      if (matchesProfileRequestKey({ profileId, requestKey })) {
        clearSnapshotStateForRequestKey(requestKey);
      }
    }
  }

  function clearAllSnapshotState() {
    for (const requestKey of new Set([
      ...snapshotWatchStates.keys(),
      ...latestSnapshots.keys(),
      ...snapshotRequestsInFlight.keys(),
    ])) {
      clearSnapshotStateForRequestKey(requestKey);
    }
  }

  function invalidateAllSnapshotState() {
    snapshotStateVersion += 1;
    clearAllSnapshotState();
  }

  function invalidateProfileSnapshotState(profileId: string) {
    snapshotStateVersion += 1;
    clearSnapshotStateForProfile(profileId);
  }

  function isSnapshotContextCurrent(context: SnapshotRequestContext) {
    return context.stateVersion === snapshotStateVersion;
  }

  function pruneSupersededLocalizationState(args: {
    requestKey: string;
    scannedAt: string;
  }) {
    for (const localizationRequestKey of latestLocalizations.keys()) {
      if (
        !matchesLocalizationRequestScope({
          localizationRequestKey,
          requestKey: args.requestKey,
        })
      ) {
        continue;
      }

      if (
        extractSnapshotScannedAtFromLocalizationRequestKey(
          localizationRequestKey,
        ) !== args.scannedAt
      ) {
        latestLocalizations.delete(localizationRequestKey);
      }
    }

    for (const localizationRequestKey of latestLocalizationFailures.keys()) {
      if (
        !matchesLocalizationRequestScope({
          localizationRequestKey,
          requestKey: args.requestKey,
        })
      ) {
        continue;
      }

      if (
        extractSnapshotScannedAtFromLocalizationRequestKey(
          localizationRequestKey,
        ) !== args.scannedAt
      ) {
        latestLocalizationFailures.delete(localizationRequestKey);
      }
    }

    for (const localizationRequestKey of latestLocalizationProgress.keys()) {
      if (
        !matchesLocalizationRequestScope({
          localizationRequestKey,
          requestKey: args.requestKey,
        })
      ) {
        continue;
      }

      if (
        extractSnapshotScannedAtFromLocalizationRequestKey(
          localizationRequestKey,
        ) !== args.scannedAt
      ) {
        latestLocalizationProgress.delete(localizationRequestKey);
      }
    }
  }

  function updateSnapshotWatchState(args: {
    requestKey: string;
    selection: SnapshotRequestContext["selection"];
    snapshot: ModSourceSnapshot;
  }) {
    const rootWatchPaths = [
      args.selection?.installationPath
        ? toReadablePath(args.selection.installationPath)
        : null,
      args.selection?.installationPath
        ? toReadablePath(win32.join(args.selection.installationPath, "Mods"))
        : null,
      args.selection?.installationPath
        ? toReadablePath(win32.join(args.selection.installationPath, "Data"))
        : null,
      args.selection?.workshopPath
        ? toReadablePath(args.selection.workshopPath)
        : null,
      args.selection?.configPath
        ? toReadablePath(args.selection.configPath)
        : null,
    ].filter((path): path is string => Boolean(path));
    const aboutWatchGroups = args.snapshot.entries.map((entry) =>
      createWatchGroup(
        [
          entry.hasAboutXml
            ? join(entry.modReadablePath, "About")
            : entry.modReadablePath,
        ],
        () => {
          const state = snapshotWatchStates.get(args.requestKey);

          if (state) {
            state.isDirty = true;
          }
        },
        {
          label: "snapshot-about",
        },
      ),
    );
    const rootWatchGroup = createWatchGroup(
      rootWatchPaths,
      () => {
        const state = snapshotWatchStates.get(args.requestKey);

        if (state) {
          state.isDirty = true;
        }
      },
      {
        label: "snapshot-roots",
      },
    );

    const nextState: SnapshotWatchState = {
      aboutWatchGroups,
      isDirty:
        rootWatchGroup.hasSetupFailures ||
        aboutWatchGroups.some((group) => group.hasSetupFailures),
      rootWatchGroup,
    };

    closeSnapshotWatchState(snapshotWatchStates.get(args.requestKey));
    snapshotWatchStates.set(args.requestKey, nextState);
  }

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
    const timer = setTimeout(() => {
      pendingLocalizationBackgroundTimers.delete(timer);
      void startLocalizationAnalysis(args).catch(() => {});
    }, 0);
    pendingLocalizationBackgroundTimers.add(timer);
  }

  function carryForwardLocalizationState(args: {
    context: SnapshotRequestContext;
    previousSnapshot: ModSourceSnapshot;
    refreshedSnapshot: ModSourceSnapshot;
  }) {
    const modReadablePaths = args.previousSnapshot.entries.map(
      (entry) => entry.modReadablePath,
    );
    const hasDirtyInputs =
      hasDirtyModLocalizationSessionState(modReadablePaths);

    if (hasDirtyInputs) {
      if (debugLocalizationCarryForward) {
        console.log("[localization-carry-forward] skip dirty", {
          modCount: modReadablePaths.length,
          refreshedSnapshotScannedAt: args.refreshedSnapshot.scannedAt,
        });
      }
      return false;
    }

    const previousRequestKey = createLocalizationRequestKey({
      activePackageIds: args.context.profileActivePackageIds,
      profileId: args.context.profileId,
      selection: args.context.selection,
      snapshotScannedAt: args.previousSnapshot.scannedAt,
    });
    const refreshedRequestKey = createLocalizationRequestKey({
      activePackageIds: args.context.profileActivePackageIds,
      profileId: args.context.profileId,
      selection: args.context.selection,
      snapshotScannedAt: args.refreshedSnapshot.scannedAt,
    });
    const previousLocalization = latestLocalizations.get(previousRequestKey);

    if (previousLocalization) {
      if (debugLocalizationCarryForward) {
        console.log("[localization-carry-forward] hit snapshot", {
          previousSnapshotScannedAt: args.previousSnapshot.scannedAt,
          refreshedSnapshotScannedAt: args.refreshedSnapshot.scannedAt,
        });
      }
      latestLocalizations.set(
        refreshedRequestKey,
        createRefreshedLocalizationSnapshot({
          localization: previousLocalization,
          scannedAt: args.refreshedSnapshot.scannedAt,
        }),
      );
      latestLocalizationFailures.delete(refreshedRequestKey);
      latestLocalizationProgress.set(
        refreshedRequestKey,
        createCompletedLocalizationProgress(
          args.refreshedSnapshot,
          latestLocalizationProgress.get(previousRequestKey),
        ),
      );
      return true;
    }

    const previousFailure = latestLocalizationFailures.get(previousRequestKey);

    if (previousFailure) {
      if (debugLocalizationCarryForward) {
        console.log("[localization-carry-forward] hit failure", {
          previousSnapshotScannedAt: args.previousSnapshot.scannedAt,
          refreshedSnapshotScannedAt: args.refreshedSnapshot.scannedAt,
        });
      }
      latestLocalizationFailures.set(refreshedRequestKey, previousFailure);
      latestLocalizationProgress.set(
        refreshedRequestKey,
        createUnavailableLocalizationProgress(args.refreshedSnapshot),
      );
      return true;
    }

    const previousRequest =
      localizationRequestsInFlight.get(previousRequestKey);

    if (!previousRequest) {
      if (debugLocalizationCarryForward) {
        console.log("[localization-carry-forward] miss state", {
          previousSnapshotScannedAt: args.previousSnapshot.scannedAt,
          refreshedSnapshotScannedAt: args.refreshedSnapshot.scannedAt,
        });
      }
      return false;
    }

    if (debugLocalizationCarryForward) {
      console.log("[localization-carry-forward] bridge request", {
        previousSnapshotScannedAt: args.previousSnapshot.scannedAt,
        refreshedSnapshotScannedAt: args.refreshedSnapshot.scannedAt,
      });
    }
    latestLocalizationProgress.set(
      refreshedRequestKey,
      createRefreshedLocalizationProgress({
        progress: latestLocalizationProgress.get(previousRequestKey),
        scannedAt: args.refreshedSnapshot.scannedAt,
        totalUnits: 1 + args.refreshedSnapshot.entries.length * 2,
      }),
    );

    const refreshedRequest = previousRequest
      .then((localizationSnapshot) => {
        const refreshedLocalizationSnapshot =
          createRefreshedLocalizationSnapshot({
            localization: localizationSnapshot,
            scannedAt: args.refreshedSnapshot.scannedAt,
          });

        latestLocalizations.set(
          refreshedRequestKey,
          refreshedLocalizationSnapshot,
        );
        latestLocalizationFailures.delete(refreshedRequestKey);
        latestLocalizationProgress.set(
          refreshedRequestKey,
          createCompletedLocalizationProgress(
            args.refreshedSnapshot,
            latestLocalizationProgress.get(previousRequestKey),
          ),
        );
        return refreshedLocalizationSnapshot;
      })
      .catch((error) => {
        latestLocalizationFailures.set(refreshedRequestKey, {
          error,
        });
        latestLocalizationProgress.set(
          refreshedRequestKey,
          createUnavailableLocalizationProgress(args.refreshedSnapshot),
        );
        throw error;
      })
      .finally(() => {
        if (
          localizationRequestsInFlight.get(refreshedRequestKey) ===
          refreshedRequest
        ) {
          localizationRequestsInFlight.delete(refreshedRequestKey);
        }
      });

    localizationRequestsInFlight.set(refreshedRequestKey, refreshedRequest);
    return true;
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
      stateVersion: snapshotStateVersion,
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
        if (
          !isSnapshotContextCurrent(args.context) ||
          latestSnapshotScannedAtByRequestKey.get(args.context.requestKey) !==
            args.snapshot.scannedAt
        ) {
          return;
        }

        latestLocalizationProgress.set(localizationRequestKey, {
          ...progress,
          scannedAt: args.snapshot.scannedAt,
          state: "pending",
        });
      },
      toReadablePath,
    })
      .then((localizationSnapshot) => {
        if (
          !isSnapshotContextCurrent(args.context) ||
          latestSnapshotScannedAtByRequestKey.get(args.context.requestKey) !==
            args.snapshot.scannedAt
        ) {
          return localizationSnapshot;
        }

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
        if (
          !isSnapshotContextCurrent(args.context) ||
          latestSnapshotScannedAtByRequestKey.get(args.context.requestKey) !==
            args.snapshot.scannedAt
        ) {
          throw error;
        }

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

    const cachedSnapshot = latestSnapshots.get(context.requestKey);
    const snapshotWatchState = snapshotWatchStates.get(context.requestKey);

    if (cachedSnapshot && snapshotWatchState && !snapshotWatchState.isDirty) {
      const refreshedSnapshot = createRefreshedSnapshot(cachedSnapshot);
      latestSnapshots.set(context.requestKey, refreshedSnapshot);
      latestSnapshotScannedAtByRequestKey.set(
        context.requestKey,
        refreshedSnapshot.scannedAt,
      );
      pruneSupersededLocalizationState({
        requestKey: context.requestKey,
        scannedAt: refreshedSnapshot.scannedAt,
      });

      if (
        !carryForwardLocalizationState({
          context,
          previousSnapshot: cachedSnapshot,
          refreshedSnapshot,
        })
      ) {
        startLocalizationAnalysisInBackground({
          context,
          snapshot: refreshedSnapshot,
        });
      }

      return refreshedSnapshot;
    }

    const request = readModSourceSnapshotImpl(context.selection, {
      activePackageIdsOverride: context.profileActivePackageIds,
      toReadablePath,
    })
      .then((snapshot) => {
        if (!isSnapshotContextCurrent(context)) {
          return snapshot;
        }

        const previousSnapshot = latestSnapshots.get(context.requestKey);
        latestSnapshots.set(context.requestKey, snapshot);
        latestSnapshotScannedAtByRequestKey.set(
          context.requestKey,
          snapshot.scannedAt,
        );
        pruneSupersededLocalizationState({
          requestKey: context.requestKey,
          scannedAt: snapshot.scannedAt,
        });
        updateSnapshotWatchState({
          requestKey: context.requestKey,
          selection: context.selection,
          snapshot,
        });

        if (
          previousSnapshot &&
          areSnapshotsLocalizationEquivalent(previousSnapshot, snapshot) &&
          carryForwardLocalizationState({
            context,
            previousSnapshot,
            refreshedSnapshot: snapshot,
          })
        ) {
          return snapshot;
        }

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
      invalidateProfileSnapshotState(input.profileId);
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
      invalidateProfileSnapshotState(input.profileId);

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
      invalidateAllSnapshotState();
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
        toPublicModSourceSnapshot(
          await getModSourceSnapshotSingleFlight(input.profileId),
        ),
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
      invalidateAllSnapshotState();
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
      invalidateProfileSnapshotState(input.profileId);
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

export function resetHostServiceBackgroundStateForTests() {
  for (const timer of pendingLocalizationBackgroundTimers) {
    clearTimeout(timer);
  }

  pendingLocalizationBackgroundTimers.clear();
}
