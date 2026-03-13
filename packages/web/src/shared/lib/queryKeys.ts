export const queryKeys = {
  bootstrap: () => ["bootstrap"] as const,
  settings: () => ["settings"] as const,
  profileCatalog: () => ["profile-catalog"] as const,
  modLibraryRoot: () => ["mod-library"] as const,
  modLibrary: (profileId: string) => ["mod-library", profileId] as const,
  modOrderAnalysisRoot: () => ["mod-order-analysis"] as const,
  modOrderAnalysis: (profileId: string) =>
    ["mod-order-analysis", profileId] as const,
};
