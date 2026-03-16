export const queryKeys = {
  bootstrap: () => ["bootstrap"] as const,
  settings: () => ["settings"] as const,
  llmSettings: () => ["llm-settings"] as const,
  profileCatalog: () => ["profile-catalog"] as const,
  modSourceSnapshotRoot: () => ["mod-source-snapshot"] as const,
  modSourceSnapshot: (profileId: string) =>
    ["mod-source-snapshot", profileId] as const,
  modLocalizationSnapshotRoot: () => ["mod-localization-snapshot"] as const,
  modLocalizationSnapshot: (profileId: string, snapshotScannedAt: string) =>
    ["mod-localization-snapshot", profileId, snapshotScannedAt] as const,
  modLocalizationProgressRoot: () => ["mod-localization-progress"] as const,
  modLocalizationProgress: (profileId: string, snapshotScannedAt: string) =>
    ["mod-localization-progress", profileId, snapshotScannedAt] as const,
};
