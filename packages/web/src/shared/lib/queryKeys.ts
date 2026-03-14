export const queryKeys = {
  bootstrap: () => ["bootstrap"] as const,
  settings: () => ["settings"] as const,
  llmSettings: () => ["llm-settings"] as const,
  profileCatalog: () => ["profile-catalog"] as const,
  modSourceSnapshotRoot: () => ["mod-source-snapshot"] as const,
  modSourceSnapshot: (profileId: string) =>
    ["mod-source-snapshot", profileId] as const,
};
