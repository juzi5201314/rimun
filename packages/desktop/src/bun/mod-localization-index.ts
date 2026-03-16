import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  ensureAppDatabaseSchema,
  resolveAppDataDirectory,
  resolveDatabasePath,
} from "./persistence";

export type TranslationBucket = "defInjected" | "keyed" | "strings";

export type TranslationEntryVectors = Record<TranslationBucket, number[]>;

export type PersistedLanguageContribution = {
  entries: TranslationEntryVectors;
  hasAnyLanguagesRoot: boolean;
  matchedFolderName: string | null;
};

export type CachedDescriptorArtifactsRecord = {
  baselineEntries: TranslationEntryVectors;
  currentLanguageContribution: PersistedLanguageContribution;
  fingerprint: string;
  hasSelfTranslation: boolean;
};

export type CachedDefsBaselineRecord = {
  fingerprint: string;
  ids: number[];
};

type DescriptorCacheRow = {
  analyzer_version: number;
  baseline_def_injected: Uint8Array | Buffer;
  baseline_keyed: Uint8Array | Buffer;
  baseline_strings: Uint8Array | Buffer;
  current_def_injected: Uint8Array | Buffer;
  current_keyed: Uint8Array | Buffer;
  current_strings: Uint8Array | Buffer;
  fingerprint: string;
  has_any_languages_root: number;
  has_self_translation: number;
  matched_folder_name: string | null;
};

type DefsCacheRow = {
  analyzer_version: number;
  fingerprint: string;
  ids_blob: Uint8Array | Buffer;
};

type TermRow = {
  term_id: number;
};

type DatabaseState = {
  descriptorCacheSelect: ReturnType<Database["query"]>;
  descriptorCacheUpsert: ReturnType<Database["query"]>;
  defsCacheSelect: ReturnType<Database["query"]>;
  defsCacheUpsert: ReturnType<Database["query"]>;
  insertTerm: ReturnType<Database["query"]>;
  path: string;
  selectTerm: ReturnType<Database["query"]>;
  sqlite: Database;
  termIdsByBucket: Record<TranslationBucket, Map<string, number>>;
};

const LOCALIZATION_ANALYZER_VERSION = 1;

let databaseState: DatabaseState | null = null;
let forcedDatabasePath: string | null = null;

function isReadonlyDatabaseError(error: unknown) {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === "SQLITE_READONLY"
  );
}

function shouldFallbackToTempDatabase(error: unknown) {
  if (isReadonlyDatabaseError(error)) {
    return true;
  }

  return (
    error instanceof Error &&
    error.message.includes("no such table: localization_descriptor_cache")
  );
}

function createEmptyTranslationEntryVectors(): TranslationEntryVectors {
  return {
    defInjected: [],
    keyed: [],
    strings: [],
  };
}

function createTermDictionary() {
  return {
    defInjected: new Map<string, number>(),
    keyed: new Map<string, number>(),
    strings: new Map<string, number>(),
  } satisfies Record<TranslationBucket, Map<string, number>>;
}

function encodeUint32Array(values: number[]) {
  if (values.length === 0) {
    return new Uint8Array(0);
  }

  const buffer = Buffer.allocUnsafe(values.length * 4);

  for (let index = 0; index < values.length; index += 1) {
    buffer.writeUInt32LE(values[index] ?? 0, index * 4);
  }

  return new Uint8Array(buffer);
}

function toUint8Array(value: Buffer | Uint8Array) {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function decodeUint32Array(value: Buffer | Uint8Array) {
  const bytes = toUint8Array(value);

  if (bytes.byteLength === 0) {
    return [] as number[];
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Array<number>(bytes.byteLength / 4);

  for (let index = 0; index < values.length; index += 1) {
    values[index] = view.getUint32(index * 4, true);
  }

  return values;
}

function cloneTranslationEntryVectors(
  entries: TranslationEntryVectors,
): TranslationEntryVectors {
  return {
    defInjected: [...entries.defInjected],
    keyed: [...entries.keyed],
    strings: [...entries.strings],
  };
}

function resolveTempDatabasePath() {
  return join("/tmp", "rimun-localization-cache.sqlite");
}

function createDatabaseStateForPath(path: string): DatabaseState {
  const databasePath = resolveDatabasePath();

  mkdirSync(path === databasePath ? resolveAppDataDirectory() : "/tmp", {
    recursive: true,
  });

  const sqlite = new Database(path, { create: true });
  ensureAppDatabaseSchema(sqlite);
  sqlite.exec(`
      DELETE FROM localization_descriptor_cache
      WHERE analyzer_version <> ${LOCALIZATION_ANALYZER_VERSION};

      DELETE FROM localization_defs_cache
      WHERE analyzer_version <> ${LOCALIZATION_ANALYZER_VERSION};
    `);

  return {
    descriptorCacheSelect: sqlite.query(
      `SELECT
          analyzer_version,
          baseline_def_injected,
          baseline_keyed,
          baseline_strings,
          current_def_injected,
          current_keyed,
          current_strings,
          fingerprint,
          has_any_languages_root,
          has_self_translation,
          matched_folder_name
        FROM localization_descriptor_cache
        WHERE cache_key = ?1`,
    ),
    descriptorCacheUpsert: sqlite.query(`
        INSERT INTO localization_descriptor_cache (
          cache_key,
          analyzer_version,
          fingerprint,
          has_any_languages_root,
          matched_folder_name,
          has_self_translation,
          baseline_keyed,
          baseline_def_injected,
          baseline_strings,
          current_keyed,
          current_def_injected,
          current_strings
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(cache_key) DO UPDATE SET
          analyzer_version = excluded.analyzer_version,
          fingerprint = excluded.fingerprint,
          has_any_languages_root = excluded.has_any_languages_root,
          matched_folder_name = excluded.matched_folder_name,
          has_self_translation = excluded.has_self_translation,
          baseline_keyed = excluded.baseline_keyed,
          baseline_def_injected = excluded.baseline_def_injected,
          baseline_strings = excluded.baseline_strings,
          current_keyed = excluded.current_keyed,
          current_def_injected = excluded.current_def_injected,
          current_strings = excluded.current_strings
      `),
    defsCacheSelect: sqlite.query(
      `SELECT analyzer_version, fingerprint, ids_blob
        FROM localization_defs_cache
        WHERE cache_key = ?1`,
    ),
    defsCacheUpsert: sqlite.query(`
        INSERT INTO localization_defs_cache (
          cache_key,
          analyzer_version,
          fingerprint,
          ids_blob
        ) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(cache_key) DO UPDATE SET
          analyzer_version = excluded.analyzer_version,
          fingerprint = excluded.fingerprint,
          ids_blob = excluded.ids_blob
      `),
    insertTerm: sqlite.query(`
        INSERT INTO localization_terms (bucket, normalized_translation_id)
        VALUES (?1, ?2)
        ON CONFLICT(bucket, normalized_translation_id) DO NOTHING
      `),
    path,
    selectTerm: sqlite.query(
      `SELECT term_id
        FROM localization_terms
        WHERE bucket = ?1 AND normalized_translation_id = ?2`,
    ),
    sqlite,
    termIdsByBucket: createTermDictionary(),
  } satisfies DatabaseState;
}

function switchToTempDatabase() {
  const tempDatabasePath = resolveTempDatabasePath();

  if (databaseState?.path === tempDatabasePath) {
    return databaseState;
  }

  forcedDatabasePath = tempDatabasePath;
  databaseState?.sqlite.close(false);
  databaseState = createDatabaseStateForPath(tempDatabasePath);
  return databaseState;
}

function withWritableDatabaseState<TResult>(
  operation: (state: DatabaseState) => TResult,
) {
  const state = getDatabaseState();

  try {
    return operation(state);
  } catch (error) {
    if (!isReadonlyDatabaseError(error)) {
      throw error;
    }

    const fallbackState = switchToTempDatabase();

    if (!fallbackState) {
      throw error;
    }

    return operation(fallbackState);
  }
}

function getDatabaseState(): DatabaseState {
  const databasePath = resolveDatabasePath();
  const preferredPath = forcedDatabasePath ?? databasePath;

  if (databaseState && databaseState.path === preferredPath) {
    return databaseState;
  }

  databaseState?.sqlite.close(false);

  try {
    forcedDatabasePath = null;
    databaseState = createDatabaseStateForPath(databasePath);
  } catch (error) {
    if (!shouldFallbackToTempDatabase(error)) {
      throw error;
    }

    forcedDatabasePath = resolveTempDatabasePath();
    databaseState = createDatabaseStateForPath(resolveTempDatabasePath());
  }

  if (!databaseState) {
    throw new Error("Expected localization cache database state.");
  }

  return databaseState;
}

function decodeDescriptorRow(
  row: DescriptorCacheRow,
): CachedDescriptorArtifactsRecord | null {
  if (row.analyzer_version !== LOCALIZATION_ANALYZER_VERSION) {
    return null;
  }

  return {
    baselineEntries: {
      defInjected: decodeUint32Array(row.baseline_def_injected),
      keyed: decodeUint32Array(row.baseline_keyed),
      strings: decodeUint32Array(row.baseline_strings),
    },
    currentLanguageContribution: {
      entries: {
        defInjected: decodeUint32Array(row.current_def_injected),
        keyed: decodeUint32Array(row.current_keyed),
        strings: decodeUint32Array(row.current_strings),
      },
      hasAnyLanguagesRoot: row.has_any_languages_root === 1,
      matchedFolderName: row.matched_folder_name,
    },
    fingerprint: row.fingerprint,
    hasSelfTranslation: row.has_self_translation === 1,
  };
}

function decodeDefsRow(row: DefsCacheRow): CachedDefsBaselineRecord | null {
  if (row.analyzer_version !== LOCALIZATION_ANALYZER_VERSION) {
    return null;
  }

  return {
    fingerprint: row.fingerprint,
    ids: decodeUint32Array(row.ids_blob),
  };
}

export function loadCachedDescriptorArtifacts(args: {
  cacheKey: string;
  fingerprint: string;
}) {
  const state = getDatabaseState();
  const row = state.descriptorCacheSelect.get(
    args.cacheKey,
  ) as DescriptorCacheRow | null;

  if (!row) {
    return null;
  }

  const decoded = decodeDescriptorRow(row);

  if (!decoded || decoded.fingerprint !== args.fingerprint) {
    return null;
  }

  return {
    baselineEntries: cloneTranslationEntryVectors(decoded.baselineEntries),
    currentLanguageContribution: {
      entries: cloneTranslationEntryVectors(
        decoded.currentLanguageContribution.entries,
      ),
      hasAnyLanguagesRoot: decoded.currentLanguageContribution.hasAnyLanguagesRoot,
      matchedFolderName: decoded.currentLanguageContribution.matchedFolderName,
    },
    fingerprint: decoded.fingerprint,
    hasSelfTranslation: decoded.hasSelfTranslation,
  } satisfies CachedDescriptorArtifactsRecord;
}

export function saveCachedDescriptorArtifacts(args: {
  artifacts: CachedDescriptorArtifactsRecord;
  cacheKey: string;
}) {
  withWritableDatabaseState((state) => {
    state.descriptorCacheUpsert.run(
      args.cacheKey,
      LOCALIZATION_ANALYZER_VERSION,
      args.artifacts.fingerprint,
      Number(args.artifacts.currentLanguageContribution.hasAnyLanguagesRoot),
      args.artifacts.currentLanguageContribution.matchedFolderName,
      Number(args.artifacts.hasSelfTranslation),
      encodeUint32Array(args.artifacts.baselineEntries.keyed),
      encodeUint32Array(args.artifacts.baselineEntries.defInjected),
      encodeUint32Array(args.artifacts.baselineEntries.strings),
      encodeUint32Array(
        args.artifacts.currentLanguageContribution.entries.keyed,
      ),
      encodeUint32Array(
        args.artifacts.currentLanguageContribution.entries.defInjected,
      ),
      encodeUint32Array(
        args.artifacts.currentLanguageContribution.entries.strings,
      ),
    );
  });
}

export function loadCachedDefsBaseline(args: {
  cacheKey: string;
  fingerprint: string;
}) {
  const state = getDatabaseState();
  const row = state.defsCacheSelect.get(args.cacheKey) as DefsCacheRow | null;

  if (!row) {
    return null;
  }

  const decoded = decodeDefsRow(row);

  if (!decoded || decoded.fingerprint !== args.fingerprint) {
    return null;
  }

  return {
    fingerprint: decoded.fingerprint,
    ids: [...decoded.ids],
  } satisfies CachedDefsBaselineRecord;
}

export function saveCachedDefsBaseline(args: {
  cacheKey: string;
  record: CachedDefsBaselineRecord;
}) {
  withWritableDatabaseState((state) => {
    state.defsCacheUpsert.run(
      args.cacheKey,
      LOCALIZATION_ANALYZER_VERSION,
      args.record.fingerprint,
      encodeUint32Array(args.record.ids),
    );
  });
}

function internTermsForBucket(
  bucket: TranslationBucket,
  orderedIds: readonly string[],
) {
  if (orderedIds.length === 0) {
    return [] as number[];
  }

  const state = getDatabaseState();
  let knownTerms = state.termIdsByBucket[bucket];
  const resolved = new Array<number>(orderedIds.length);
  const misses = new Map<string, number[]>();

  for (const [index, id] of orderedIds.entries()) {
    const cached = knownTerms.get(id);

    if (cached !== undefined) {
      resolved[index] = cached;
      continue;
    }

    const pending = misses.get(id) ?? [];
    pending.push(index);
    misses.set(id, pending);
  }

  if (misses.size > 0) {
    const uniqueMisses = [...misses.keys()];
    withWritableDatabaseState((writableState) => {
      const transaction = writableState.sqlite.transaction((values: string[]) => {
        for (const value of values) {
          writableState.insertTerm.run(bucket, value);
          const row = writableState.selectTerm.get(
            bucket,
            value,
          ) as TermRow | null;

          if (!row) {
            throw new Error(
              `Expected localization term id for ${bucket}:${value}`,
            );
          }

          writableState.termIdsByBucket[bucket].set(value, row.term_id);
        }
      });

      transaction(uniqueMisses);
    });
    knownTerms = getDatabaseState().termIdsByBucket[bucket];
  }

  for (const [index, id] of orderedIds.entries()) {
    let termId = knownTerms.get(id);

    if (termId === undefined) {
      const currentState = getDatabaseState();
      const row = currentState.selectTerm.get(bucket, id) as TermRow | null;

      if (row) {
        currentState.termIdsByBucket[bucket].set(id, row.term_id);
        knownTerms = currentState.termIdsByBucket[bucket];
        termId = row.term_id;
      }
    }

    if (termId === undefined) {
      throw new Error(`Expected localization term id for ${bucket}:${id}`);
    }

    resolved[index] = termId;
  }

  return resolved;
}

export function internTranslationEntrySets(args: {
  defInjected: Set<string>;
  keyed: Set<string>;
  strings: Set<string>;
}) {
  return {
    defInjected: internTermsForBucket("defInjected", [...args.defInjected]),
    keyed: internTermsForBucket("keyed", [...args.keyed]),
    strings: internTermsForBucket("strings", [...args.strings]),
  } satisfies TranslationEntryVectors;
}

export function internTranslationIdsForBucket(
  bucket: TranslationBucket,
  ids: Set<string>,
) {
  return internTermsForBucket(bucket, [...ids]);
}

export function resetLocalizationIndexStateForTests() {
  databaseState?.sqlite.close(false);
  databaseState = null;
  forcedDatabasePath = null;
}

export { createEmptyTranslationEntryVectors, cloneTranslationEntryVectors };
