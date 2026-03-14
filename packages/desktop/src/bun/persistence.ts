import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AppSettings,
  CreateProfileInput,
  LlmSettings,
  ModProfileSummary,
  ProfileCatalogResult,
  SaveLlmSettingsInput,
  SaveProfileInput,
  SaveSettingsInput,
} from "@rimun/shared";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { APP_NAME, DATABASE_FILENAME } from "./config";

const SETTINGS_ROW_ID = "singleton";
const LLM_SETTINGS_ROW_ID = "singleton";
const MODELS_DEV_CACHE_ROW_ID = "singleton";
const APP_STATE_ROW_ID = "singleton";
const DEFAULT_PROFILE_ID = "default";
const DEFAULT_PROFILE_NAME = "Default";
const CORE_PACKAGE_ID = "ludeon.rimworld";
const OFFICIAL_EXPANSION_PACKAGE_ID_PREFIX = `${CORE_PACKAGE_ID}.`;

const appSettingsTable = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  installationPath: text("installation_path"),
  workshopPath: text("workshop_path"),
  configPath: text("config_path"),
  updatedAt: text("updated_at"),
});

const llmSettingsTable = sqliteTable("llm_settings", {
  id: text("id").primaryKey(),
  settingsJson: text("settings_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const modelsDevCacheTable = sqliteTable("models_dev_cache", {
  id: text("id").primaryKey(),
  payloadJson: text("payload_json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

const modProfilesTable = sqliteTable("mod_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  activePackageIdsJson: text("active_package_ids_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const appStateTable = sqliteTable("app_state", {
  id: text("id").primaryKey(),
  currentProfileId: text("current_profile_id"),
});

type ModProfileRow = typeof modProfilesTable.$inferSelect;
type ModProfileInsert = typeof modProfilesTable.$inferInsert;

export type StoredModProfile = ModProfileSummary & {
  activePackageIds: string[];
};

export function resolveAppDataDirectory() {
  const overriddenDirectory = process.env["RIMUN_APP_DATA_DIR"];

  if (overriddenDirectory) {
    return overriddenDirectory;
  }

  if (process.platform === "win32") {
    return join(
      process.env["LOCALAPPDATA"] ??
        process.env["APPDATA"] ??
        join(homedir(), "AppData", "Local"),
      APP_NAME,
    );
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_NAME);
  }

  return join(homedir(), ".local", "share", APP_NAME);
}

export function resolveDatabasePath() {
  return join(resolveAppDataDirectory(), DATABASE_FILENAME);
}

function normalizeActivePackageIds(activePackageIds: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const packageId of activePackageIds) {
    const normalizedPackageId = packageId.trim().toLowerCase();

    if (!normalizedPackageId || seen.has(normalizedPackageId)) {
      continue;
    }

    seen.add(normalizedPackageId);
    normalized.push(normalizedPackageId);
  }

  return normalized;
}

function extractOfficialExpansionPackageIds(activePackageIds: string[]) {
  return normalizeActivePackageIds(activePackageIds).filter(
    (packageId) =>
      packageId !== CORE_PACKAGE_ID &&
      packageId.startsWith(OFFICIAL_EXPANSION_PACKAGE_ID_PREFIX),
  );
}

function mergeOfficialExpansionsIntoProfile(
  activePackageIds: string[],
  initialActivePackageIds: string[],
) {
  const normalizedActivePackageIds =
    normalizeActivePackageIds(activePackageIds);

  if (
    extractOfficialExpansionPackageIds(normalizedActivePackageIds).length > 0
  ) {
    return normalizedActivePackageIds;
  }

  const initialOfficialExpansionPackageIds = extractOfficialExpansionPackageIds(
    initialActivePackageIds,
  );

  if (initialOfficialExpansionPackageIds.length === 0) {
    return normalizedActivePackageIds;
  }

  const mergedPackageIds: string[] = [];
  const seen = new Set<string>();

  const pushPackageId = (packageId: string) => {
    if (!packageId || seen.has(packageId)) {
      return;
    }

    seen.add(packageId);
    mergedPackageIds.push(packageId);
  };

  if (normalizedActivePackageIds.includes(CORE_PACKAGE_ID)) {
    pushPackageId(CORE_PACKAGE_ID);
  }

  for (const packageId of initialOfficialExpansionPackageIds) {
    pushPackageId(packageId);
  }

  for (const packageId of normalizedActivePackageIds) {
    pushPackageId(packageId);
  }

  return mergedPackageIds;
}

function parseActivePackageIds(activePackageIdsJson: string) {
  try {
    const parsed = JSON.parse(activePackageIdsJson);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeActivePackageIds(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return [];
  }
}

function toProfileSummary(row: ModProfileRow): ModProfileSummary {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toStoredProfile(row: ModProfileRow): StoredModProfile {
  return {
    ...toProfileSummary(row),
    activePackageIds: parseActivePackageIds(row.activePackageIdsJson),
  };
}

function toProfileInsert(
  input: Pick<StoredModProfile, "id" | "name" | "createdAt" | "updatedAt"> & {
    activePackageIds: string[];
  },
): ModProfileInsert {
  return {
    id: input.id,
    name: input.name,
    activePackageIdsJson: JSON.stringify(
      normalizeActivePackageIds(input.activePackageIds),
    ),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function createDatabase() {
  const appDataDirectory = resolveAppDataDirectory();
  mkdirSync(appDataDirectory, { recursive: true });

  const sqlite = new Database(resolveDatabasePath(), { create: true });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY NOT NULL,
      channel TEXT NOT NULL,
      installation_path TEXT,
      workshop_path TEXT,
      config_path TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS llm_settings (
      id TEXT PRIMARY KEY NOT NULL,
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models_dev_cache (
      id TEXT PRIMARY KEY NOT NULL,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mod_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      active_package_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY NOT NULL,
      current_profile_id TEXT
    );
  `);

  return {
    sqlite,
    db: drizzle(sqlite),
  };
}

export class SettingsRepository {
  private readonly sqlite: Database;
  private readonly db: ReturnType<typeof drizzle>;

  public constructor() {
    const { sqlite, db } = createDatabase();
    this.sqlite = sqlite;
    this.db = db;
  }

  public getSettings(): AppSettings {
    const row = this.db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.id, SETTINGS_ROW_ID))
      .get();

    if (!row) {
      return {
        channel: "steam",
        installationPath: null,
        workshopPath: null,
        configPath: null,
        updatedAt: null,
      };
    }

    return {
      channel: row.channel as AppSettings["channel"],
      installationPath: row.installationPath,
      workshopPath: row.workshopPath,
      configPath: row.configPath,
      updatedAt: row.updatedAt,
    };
  }

  public getLlmSettings(): LlmSettings {
    const row = this.db
      .select()
      .from(llmSettingsTable)
      .where(eq(llmSettingsTable.id, LLM_SETTINGS_ROW_ID))
      .get();

    if (!row) {
      return {
        providers: [],
        updatedAt: null,
      };
    }

    try {
      const parsed = JSON.parse(row.settingsJson) as {
        providers?: LlmSettings["providers"];
      };

      return {
        providers: Array.isArray(parsed.providers) ? parsed.providers : [],
        updatedAt: row.updatedAt,
      };
    } catch {
      return {
        providers: [],
        updatedAt: row.updatedAt,
      };
    }
  }

  public saveSettings(input: SaveSettingsInput): AppSettings {
    const updatedAt = new Date().toISOString();

    this.db
      .insert(appSettingsTable)
      .values({
        id: SETTINGS_ROW_ID,
        channel: input.channel,
        installationPath: input.installationPath,
        workshopPath: input.workshopPath,
        configPath: input.configPath,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appSettingsTable.id,
        set: {
          channel: input.channel,
          installationPath: input.installationPath,
          workshopPath: input.workshopPath,
          configPath: input.configPath,
          updatedAt,
        },
      })
      .run();

    return {
      channel: input.channel,
      installationPath: input.installationPath,
      workshopPath: input.workshopPath,
      configPath: input.configPath,
      updatedAt,
    };
  }

  public saveLlmSettings(input: SaveLlmSettingsInput): LlmSettings {
    const updatedAt = new Date().toISOString();
    const settingsJson = JSON.stringify({
      providers: input.providers,
    });

    this.db
      .insert(llmSettingsTable)
      .values({
        id: LLM_SETTINGS_ROW_ID,
        settingsJson,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: llmSettingsTable.id,
        set: {
          settingsJson,
          updatedAt,
        },
      })
      .run();

    return {
      providers: input.providers,
      updatedAt,
    };
  }

  public getModelsDevCache() {
    return this.db
      .select()
      .from(modelsDevCacheTable)
      .where(eq(modelsDevCacheTable.id, MODELS_DEV_CACHE_ROW_ID))
      .get();
  }

  public saveModelsDevCache(payloadJson: string) {
    const fetchedAt = new Date().toISOString();

    this.db
      .insert(modelsDevCacheTable)
      .values({
        id: MODELS_DEV_CACHE_ROW_ID,
        payloadJson,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: modelsDevCacheTable.id,
        set: {
          payloadJson,
          fetchedAt,
        },
      })
      .run();

    return {
      payloadJson,
      fetchedAt,
    };
  }

  public getProfileCatalog(
    initialActivePackageIds: string[] = [],
  ): ProfileCatalogResult {
    this.ensureProfileState(initialActivePackageIds);

    return {
      currentProfileId: this.requireCurrentProfileId(),
      profiles: this.listProfileRows().map((row) => toProfileSummary(row)),
    };
  }

  public getCurrentProfile(initialActivePackageIds: string[] = []) {
    this.ensureProfileState(initialActivePackageIds);

    return this.hydrateProfile(
      this.requireProfile(this.requireCurrentProfileId()),
      initialActivePackageIds,
    );
  }

  public getProfile(
    profileId: string,
    initialActivePackageIds: string[] = [],
  ): StoredModProfile {
    this.ensureProfileState(initialActivePackageIds);

    return this.hydrateProfile(
      this.requireProfile(profileId),
      initialActivePackageIds,
    );
  }

  public createProfile(
    input: CreateProfileInput,
    initialActivePackageIds: string[] = [],
  ): ProfileCatalogResult {
    this.ensureProfileState(initialActivePackageIds);
    const sourceProfile = this.getProfile(
      input.sourceProfileId,
      initialActivePackageIds,
    );
    const now = new Date().toISOString();

    this.db
      .insert(modProfilesTable)
      .values(
        toProfileInsert({
          id: crypto.randomUUID(),
          name: input.name,
          activePackageIds: sourceProfile.activePackageIds,
          createdAt: now,
          updatedAt: now,
        }),
      )
      .run();

    return this.getProfileCatalog();
  }

  public renameProfile(
    profileId: string,
    name: string,
    initialActivePackageIds: string[] = [],
  ): ProfileCatalogResult {
    this.ensureProfileState(initialActivePackageIds);
    this.requireProfile(profileId);

    this.db
      .update(modProfilesTable)
      .set({
        name,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(modProfilesTable.id, profileId))
      .run();

    return this.getProfileCatalog();
  }

  public saveProfile(
    input: SaveProfileInput,
    initialActivePackageIds: string[] = [],
  ): StoredModProfile {
    this.ensureProfileState(initialActivePackageIds);
    const currentProfile = this.requireProfile(input.profileId);

    this.db
      .update(modProfilesTable)
      .set({
        name: input.name,
        activePackageIdsJson: JSON.stringify(
          normalizeActivePackageIds(input.activePackageIds),
        ),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(modProfilesTable.id, input.profileId))
      .run();

    return this.requireProfile(currentProfile.id);
  }

  public deleteProfile(
    profileId: string,
    initialActivePackageIds: string[] = [],
  ): ProfileCatalogResult {
    this.ensureProfileState(initialActivePackageIds);
    const profiles = this.listProfileRows();

    if (profiles.length <= 1) {
      throw new Error("Cannot delete the last mod profile.");
    }

    this.requireProfile(profileId);

    this.db
      .delete(modProfilesTable)
      .where(eq(modProfilesTable.id, profileId))
      .run();

    if (this.requireCurrentProfileId() === profileId) {
      const nextCurrentProfileId =
        this.listProfileRows().find((row) => row.id === DEFAULT_PROFILE_ID)
          ?.id ?? this.listProfileRows()[0]?.id;

      if (!nextCurrentProfileId) {
        throw new Error("Expected a replacement mod profile after deletion.");
      }

      this.setCurrentProfileId(nextCurrentProfileId);
    }

    return this.getProfileCatalog();
  }

  public switchProfile(
    profileId: string,
    initialActivePackageIds: string[] = [],
  ): ProfileCatalogResult {
    this.ensureProfileState(initialActivePackageIds);
    this.requireProfile(profileId);
    this.setCurrentProfileId(profileId);

    return this.getProfileCatalog();
  }

  public getCurrentProfileId(initialActivePackageIds: string[] = []) {
    this.ensureProfileState(initialActivePackageIds);

    return this.requireCurrentProfileId();
  }

  public close() {
    this.sqlite.close(false);
  }

  private ensureProfileState(initialActivePackageIds: string[]) {
    const profiles = this.listProfileRows();

    if (profiles.length === 0) {
      const now = new Date().toISOString();

      this.db
        .insert(modProfilesTable)
        .values(
          toProfileInsert({
            id: DEFAULT_PROFILE_ID,
            name: DEFAULT_PROFILE_NAME,
            activePackageIds: initialActivePackageIds,
            createdAt: now,
            updatedAt: now,
          }),
        )
        .run();

      this.setCurrentProfileId(DEFAULT_PROFILE_ID);
      return;
    }

    const currentProfileId = this.readCurrentProfileId();

    if (
      !currentProfileId ||
      !profiles.some((profile) => profile.id === currentProfileId)
    ) {
      const fallbackProfileId =
        profiles.find((profile) => profile.id === DEFAULT_PROFILE_ID)?.id ??
        profiles[0]?.id;

      if (!fallbackProfileId) {
        throw new Error("Expected at least one mod profile.");
      }

      this.setCurrentProfileId(fallbackProfileId);
    }
  }

  private listProfileRows() {
    return this.db
      .select()
      .from(modProfilesTable)
      .orderBy(asc(modProfilesTable.createdAt), asc(modProfilesTable.id))
      .all();
  }

  private requireProfile(profileId: string) {
    const row = this.db
      .select()
      .from(modProfilesTable)
      .where(eq(modProfilesTable.id, profileId))
      .get();

    if (!row) {
      throw new Error(`Mod profile ${profileId} was not found.`);
    }

    return toStoredProfile(row);
  }

  private hydrateProfile(
    profile: StoredModProfile,
    initialActivePackageIds: string[],
  ) {
    return {
      ...profile,
      activePackageIds: mergeOfficialExpansionsIntoProfile(
        profile.activePackageIds,
        initialActivePackageIds,
      ),
    };
  }

  private readCurrentProfileId() {
    return this.db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.id, APP_STATE_ROW_ID))
      .get()?.currentProfileId;
  }

  private requireCurrentProfileId() {
    const currentProfileId = this.readCurrentProfileId();

    if (!currentProfileId) {
      throw new Error("Current mod profile is not set.");
    }

    return currentProfileId;
  }

  private setCurrentProfileId(profileId: string) {
    this.db
      .insert(appStateTable)
      .values({
        id: APP_STATE_ROW_ID,
        currentProfileId: profileId,
      })
      .onConflictDoUpdate({
        target: appStateTable.id,
        set: {
          currentProfileId: profileId,
        },
      })
      .run();
  }
}
