import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppSettings, SaveSettingsInput } from "@rimun/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { APP_NAME, DATABASE_FILENAME } from "./config";

const SETTINGS_ROW_ID = "singleton";

const appSettingsTable = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  installationPath: text("installation_path"),
  workshopPath: text("workshop_path"),
  configPath: text("config_path"),
  updatedAt: text("updated_at"),
});

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

  public close() {
    this.sqlite.close(false);
  }
}
