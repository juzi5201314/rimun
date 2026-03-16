import { z } from "zod";

export const emptyParamsSchema = z.object({}).strict();
export const profileIdSchema = z.string().trim().min(1);
export const profileNameSchema = z.string().trim().min(1).max(64);

export const executionPlatformSchema = z.enum([
  "windows",
  "linux",
  "macos",
  "unknown",
]);

export const distributionChannelSchema = z.enum([
  "steam",
  "gog",
  "epic",
  "manual",
]);

export const pathKindSchema = z.enum(["installation", "workshop", "config"]);

export const pathDiscoverySourceSchema = z.enum(["auto", "manual"]);

export const validationIssueCodeSchema = z.enum([
  "missing_path",
  "not_absolute_windows_path",
  "missing_drive_mapping",
  "path_not_found",
  "not_readable",
  "unknown_error",
]);

export const errorCodeSchema = z.enum([
  "validation_error",
  "environment_error",
  "filesystem_error",
  "persistence_error",
  "unknown_error",
]);

export const isoDateTimeSchema = z.iso.datetime();

export const modSourceSchema = z.enum(["installation", "workshop"]);
export const modOrderRecommendationActionSchema = z.enum([
  "enableMissingDependencies",
  "reorderActiveMods",
]);
export const modOrderEdgeKindSchema = z.enum([
  "official_anchor",
  "dependency",
  "load_after",
  "load_before",
  "force_load_after",
  "force_load_before",
]);
export const modOrderEdgeSourceSchema = z.enum(["about", "system"]);
export const modOrderSeveritySchema = z.enum(["info", "warning", "error"]);
export const modOrderDiagnosticCodeSchema = z.enum([
  "missing_installed_inactive_dependency",
  "missing_unavailable_dependency",
  "duplicate_package_id",
  "cycle_detected",
  "incompatible_mods",
  "unknown_active_mod",
  "hard_order_violation",
]);

export const windowsAbsolutePathSchema = z
  .string()
  .min(1, "Windows path is required")
  .regex(
    /^[A-Za-z]:[\\/].+/,
    "Expected an absolute Windows path such as C:\\Games\\RimWorld",
  );

export const readableAbsolutePathSchema = z
  .string()
  .min(1, "Readable path is required");

export const wslAbsolutePathSchema = z
  .string()
  .min(1, "WSL path is required")
  .regex(
    /^\/.+/,
    "Expected an absolute WSL path such as /mnt/c/Games/RimWorld",
  );

export const executionEnvironmentSchema = z.object({
  platform: executionPlatformSchema,
  isWsl: z.boolean(),
  wslDistro: z.string().trim().min(1).nullable(),
});

export const appErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  detail: z.string().min(1).nullable(),
  recoverable: z.boolean(),
});

export const detectedPathSchema = z.object({
  kind: pathKindSchema,
  channel: distributionChannelSchema,
  source: pathDiscoverySourceSchema,
  windowsPath: windowsAbsolutePathSchema,
  wslPath: wslAbsolutePathSchema.nullable(),
  exists: z.boolean(),
  readable: z.boolean(),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string().min(1)).default([]),
});

export const pathSelectionSchema = z.object({
  channel: distributionChannelSchema,
  installationPath: windowsAbsolutePathSchema.nullable(),
  workshopPath: windowsAbsolutePathSchema.nullable(),
  configPath: windowsAbsolutePathSchema.nullable(),
});

export const appSettingsSchema = pathSelectionSchema.extend({
  updatedAt: isoDateTimeSchema.nullable(),
});

export const llmApiFormatSchema = z.enum([
  "anthropic",
  "openai-chat",
  "openai-responses",
  "gemini",
]);

export const llmModelPricingSchema = z.object({
  inputCostPerMillion: z.number().nonnegative().nullable(),
  outputCostPerMillion: z.number().nonnegative().nullable(),
  reasoningCostPerMillion: z.number().nonnegative().nullable(),
  cacheReadCostPerMillion: z.number().nonnegative().nullable(),
  cacheWriteCostPerMillion: z.number().nonnegative().nullable(),
});

export const llmModelMetadataSchema = z.object({
  contextLimit: z.number().int().positive().nullable(),
  inputLimit: z.number().int().positive().nullable(),
  outputLimit: z.number().int().positive().nullable(),
  supportsToolCall: z.boolean(),
  supportsReasoning: z.boolean(),
  supportsStructuredOutput: z.boolean(),
  releaseDate: z.string().trim().min(1).nullable(),
  lastUpdated: z.string().trim().min(1).nullable(),
  pricing: llmModelPricingSchema.nullable(),
});

export const llmModelMetadataSelectionSchema = z.object({
  sourceProviderId: z.string().trim().min(1),
  sourceProviderName: z.string().trim().min(1),
});

export const llmModelConfigSchema = z.object({
  id: z.string().trim().min(1),
  modelId: z.string().trim().max(256),
  label: z.string().trim().max(128),
  enabled: z.boolean(),
  metadata: llmModelMetadataSchema.nullable(),
  metadataSelection: llmModelMetadataSelectionSchema.nullable(),
  lastMetadataRefreshAt: isoDateTimeSchema.nullable(),
});

export const llmProviderConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(128),
  format: llmApiFormatSchema,
  baseUrl: z.string().trim().url(),
  apiKey: z.string().trim(),
  enabled: z.boolean(),
  models: z.array(llmModelConfigSchema).default([]),
});

export const llmSettingsSchema = z.object({
  providers: z.array(llmProviderConfigSchema).default([]),
  updatedAt: isoDateTimeSchema.nullable(),
});

export const llmModelMetadataMatchSchema = z.object({
  sourceProviderId: z.string().trim().min(1),
  sourceProviderName: z.string().trim().min(1),
  sourceProviderApi: z.string().trim().url().nullable(),
  modelId: z.string().trim().min(1),
  modelName: z.string().trim().min(1).nullable(),
  family: z.string().trim().min(1).nullable(),
  metadata: llmModelMetadataSchema,
});

export const modDependencyMetadataSchema = z.object({
  packageIdNormalized: z.string().trim().min(1).nullable(),
  dependencies: z.array(z.string().trim().min(1)).default([]),
  loadAfter: z.array(z.string().trim().min(1)).default([]),
  loadBefore: z.array(z.string().trim().min(1)).default([]),
  forceLoadAfter: z.array(z.string().trim().min(1)).default([]),
  forceLoadBefore: z.array(z.string().trim().min(1)).default([]),
  incompatibleWith: z.array(z.string().trim().min(1)).default([]),
  supportedVersions: z.array(z.string().trim().min(1)).default([]),
});

export const currentGameLanguageSourceSchema = z.enum(["prefs", "unknown"]);

export const currentGameLanguageSchema = z.object({
  folderName: z.string().trim().min(1).nullable(),
  normalizedFolderName: z.string().trim().min(1).nullable(),
  source: currentGameLanguageSourceSchema,
});

export const modLocalizationKindSchema = z.enum([
  "translated",
  "missing",
  "missing_language",
  "unknown",
]);

export const modLocalizationCompletenessSchema = z.enum([
  "complete",
  "partial",
  "unknown",
]);

export const modLocalizationCoverageSchema = z.object({
  completeness: modLocalizationCompletenessSchema,
  coveredEntries: z.number().int().min(0),
  totalEntries: z.number().int().min(0).nullable(),
  percent: z.number().min(0).max(100).nullable(),
});

export const modLocalizationStatusSchema = z.object({
  kind: modLocalizationKindSchema,
  isSupported: z.boolean(),
  matchedFolderName: z.string().trim().min(1).nullable(),
  providerPackageIds: z.array(z.string().trim().min(1)).default([]),
  coverage: modLocalizationCoverageSchema,
});

const defaultCurrentGameLanguage = {
  folderName: null,
  normalizedFolderName: null,
  source: "unknown" as const,
};

const defaultMissingLocalizationStatus = {
  kind: "missing" as const,
  isSupported: false,
  matchedFolderName: null,
  providerPackageIds: [] as string[],
  coverage: {
    completeness: "unknown" as const,
    coveredEntries: 0,
    totalEntries: null,
    percent: null,
  },
};

export const modRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  packageId: z.string().trim().min(1).nullable(),
  author: z.string().trim().min(1).nullable(),
  version: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1).nullable(),
  source: modSourceSchema,
  windowsPath: windowsAbsolutePathSchema,
  wslPath: wslAbsolutePathSchema.nullable(),
  manifestPath: windowsAbsolutePathSchema.nullable(),
  enabled: z.boolean(),
  isOfficial: z.boolean(),
  hasAboutXml: z.boolean(),
  dependencyMetadata: modDependencyMetadataSchema,
  localizationStatus: modLocalizationStatusSchema.default(
    defaultMissingLocalizationStatus,
  ),
  notes: z.array(z.string().min(1)).default([]),
});

export const modSourceSnapshotEntrySchema = z.object({
  entryName: z.string().trim().min(1),
  source: modSourceSchema,
  modWindowsPath: windowsAbsolutePathSchema,
  modReadablePath: readableAbsolutePathSchema,
  manifestPath: windowsAbsolutePathSchema.nullable(),
  hasAboutXml: z.boolean(),
  aboutXmlText: z.string().min(1).nullable(),
  localizationStatus: modLocalizationStatusSchema.default(
    defaultMissingLocalizationStatus,
  ),
  notes: z.array(z.string().min(1)).default([]),
});

export const scannedRootsSchema = z.object({
  installationModsPath: windowsAbsolutePathSchema.nullable(),
  workshopPath: windowsAbsolutePathSchema.nullable(),
  modsConfigPath: windowsAbsolutePathSchema.nullable(),
});

export const gameVersionSchema = z.string().trim().min(1).nullable();

export const modSourceSnapshotSchema = z.object({
  environment: executionEnvironmentSchema,
  selection: pathSelectionSchema.nullable(),
  scannedAt: isoDateTimeSchema,
  scannedRoots: scannedRootsSchema,
  gameVersion: gameVersionSchema,
  currentGameLanguage: currentGameLanguageSchema.default(
    defaultCurrentGameLanguage,
  ),
  activePackageIds: z.array(z.string().trim().min(1)).default([]),
  entries: z.array(modSourceSnapshotEntrySchema),
  errors: z.array(appErrorSchema),
  requiresConfiguration: z.boolean(),
});

export const modOrderEdgeSchema = z.object({
  fromPackageId: z.string().trim().min(1),
  toPackageId: z.string().trim().min(1),
  kind: modOrderEdgeKindSchema,
  source: modOrderEdgeSourceSchema,
  isHard: z.boolean(),
  reason: z.string().trim().min(1),
});

export const modOrderDiagnosticSchema = z.object({
  code: modOrderDiagnosticCodeSchema,
  severity: modOrderSeveritySchema,
  message: z.string().trim().min(1),
  packageIds: z.array(z.string().trim().min(1)).default([]),
  modIds: z.array(z.string().trim().min(1)).default([]),
  isBlocking: z.boolean(),
});

export const modOrderDependencyIssueSchema = z.object({
  packageId: z.string().trim().min(1),
  modName: z.string().trim().min(1).nullable(),
  requiredByPackageIds: z.array(z.string().trim().min(1)).default([]),
  requiredByNames: z.array(z.string().trim().min(1)).default([]),
});

export const modOrderExplanationSchema = z.object({
  packageId: z.string().trim().min(1),
  modName: z.string().trim().min(1).nullable(),
  reasons: z.array(z.string().trim().min(1)).default([]),
});

export const bootstrapPayloadSchema = z.object({
  environment: executionEnvironmentSchema,
  settings: appSettingsSchema,
  supportedChannels: z.array(distributionChannelSchema).min(1),
  preferredSelection: pathSelectionSchema.nullable(),
});

export const modProfileSummarySchema = z.object({
  id: profileIdSchema,
  name: profileNameSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const profileCatalogResultSchema = z.object({
  currentProfileId: profileIdSchema,
  profiles: z.array(modProfileSummarySchema).min(1),
});

export const profileScopedInputSchema = z.object({
  profileId: profileIdSchema,
});

export const modLocalizationSnapshotInputSchema =
  profileScopedInputSchema.extend({
    snapshotScannedAt: isoDateTimeSchema,
  });

export const modLocalizationProgressStateSchema = z.enum([
  "pending",
  "complete",
  "unavailable",
]);

export const modLocalizationProgressInputSchema =
  modLocalizationSnapshotInputSchema;

export const modLocalizationProgressSchema = z.object({
  completedUnits: z.number().int().min(0),
  percent: z.number().min(0).max(100),
  scannedAt: isoDateTimeSchema,
  state: modLocalizationProgressStateSchema,
  totalUnits: z.number().int().min(0),
});

export const modLocalizationSnapshotEntrySchema = z.object({
  localizationStatus: modLocalizationStatusSchema.default(
    defaultMissingLocalizationStatus,
  ),
  modWindowsPath: windowsAbsolutePathSchema,
});

export const modLocalizationSnapshotSchema = z.object({
  currentGameLanguage: currentGameLanguageSchema.default(
    defaultCurrentGameLanguage,
  ),
  entries: z.array(modLocalizationSnapshotEntrySchema).default([]),
  scannedAt: isoDateTimeSchema,
});

export const modLibraryResultSchema = z.object({
  environment: executionEnvironmentSchema,
  selection: pathSelectionSchema.nullable(),
  scannedAt: isoDateTimeSchema,
  scannedRoots: scannedRootsSchema,
  gameVersion: gameVersionSchema,
  currentGameLanguage: currentGameLanguageSchema.default(
    defaultCurrentGameLanguage,
  ),
  activePackageIds: z.array(z.string().trim().min(1)).default([]),
  mods: z.array(modRecordSchema),
  errors: z.array(appErrorSchema),
  requiresConfiguration: z.boolean(),
});

export const modOrderAnalysisResultSchema = z.object({
  analyzedAt: isoDateTimeSchema,
  currentActivePackageIds: z.array(z.string().trim().min(1)).default([]),
  recommendedActivePackageIds: z.array(z.string().trim().min(1)).default([]),
  recommendedOrderPackageIds: z.array(z.string().trim().min(1)).default([]),
  missingInstalledInactiveDependencies: z
    .array(modOrderDependencyIssueSchema)
    .default([]),
  missingUnavailableDependencies: z
    .array(modOrderDependencyIssueSchema)
    .default([]),
  diagnostics: z.array(modOrderDiagnosticSchema).default([]),
  explanations: z.array(modOrderExplanationSchema).default([]),
  edges: z.array(modOrderEdgeSchema).default([]),
  isOptimal: z.boolean(),
  hasBlockingIssues: z.boolean(),
  sortDifferenceCount: z.number().int().min(0),
});

export const detectPathsInputSchema = z.object({
  preferredChannels: z
    .array(distributionChannelSchema)
    .min(1)
    .default(["steam"]),
  allowFallbackToManual: z.boolean().default(true),
});

export const detectPathsResultSchema = z.object({
  environment: executionEnvironmentSchema,
  candidates: z.array(detectedPathSchema),
  preferredSelection: pathSelectionSchema.nullable(),
  errors: z.array(appErrorSchema),
  requiresManualSelection: z.boolean(),
});

export const validatePathInputSchema = z.object({
  kind: pathKindSchema,
  channel: distributionChannelSchema,
  windowsPath: windowsAbsolutePathSchema,
});

export const validatePathResultSchema = z.object({
  kind: pathKindSchema,
  channel: distributionChannelSchema,
  windowsPath: windowsAbsolutePathSchema,
  wslPath: wslAbsolutePathSchema.nullable(),
  exists: z.boolean(),
  readable: z.boolean(),
  issues: z.array(validationIssueCodeSchema),
});

export const saveSettingsInputSchema = z.object({
  channel: distributionChannelSchema,
  installationPath: windowsAbsolutePathSchema,
  workshopPath: windowsAbsolutePathSchema.nullable(),
  configPath: windowsAbsolutePathSchema.nullable(),
});

export const saveSettingsResultSchema = z.object({
  settings: appSettingsSchema,
  validation: z.array(validatePathResultSchema),
});

export const saveLlmSettingsInputSchema = z.object({
  providers: z.array(llmProviderConfigSchema).default([]),
});

export const searchModelMetadataInputSchema = z.object({
  modelId: z.string().trim().min(1).max(256),
});

export const searchModelMetadataResultSchema = z.object({
  query: z.string().trim().min(1),
  cachedAt: isoDateTimeSchema.nullable(),
  matches: z.array(llmModelMetadataMatchSchema),
});

export const createProfileInputSchema = z.object({
  name: profileNameSchema,
  sourceProfileId: profileIdSchema,
});

export const renameProfileInputSchema = z.object({
  profileId: profileIdSchema,
  name: profileNameSchema,
});

export const deleteProfileInputSchema = z.object({
  profileId: profileIdSchema,
});

export const switchProfileInputSchema = z.object({
  profileId: profileIdSchema,
});

export const saveProfileInputSchema = z.object({
  profileId: profileIdSchema,
  name: profileNameSchema,
  activePackageIds: z.array(z.string().trim().min(1)).default([]),
  applyToGame: z.boolean().default(true),
});

export const saveProfileResultSchema = modProfileSummarySchema;

export const applyActivePackageIdsInputSchema = z.object({
  profileId: profileIdSchema,
  activePackageIds: z.array(z.string().trim().min(1)).default([]),
  applyToGame: z.boolean().default(true),
});

export const applyActivePackageIdsResultSchema = modProfileSummarySchema;

const i18nDictionaryNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.record(z.string(), i18nDictionaryNodeSchema)]),
);

export const i18nDictionarySchema = z.record(
  z.string(),
  i18nDictionaryNodeSchema,
);

export const i18nDictionariesSchema = z
  .object({
    "en-us": i18nDictionarySchema,
    "zh-cn": i18nDictionarySchema,
  })
  .strict();

export type EmptyParams = z.infer<typeof emptyParamsSchema>;
export type ProfileId = z.infer<typeof profileIdSchema>;
export type ProfileName = z.infer<typeof profileNameSchema>;
export type ExecutionPlatform = z.infer<typeof executionPlatformSchema>;
export type DistributionChannel = z.infer<typeof distributionChannelSchema>;
export type PathKind = z.infer<typeof pathKindSchema>;
export type PathDiscoverySource = z.infer<typeof pathDiscoverySourceSchema>;
export type ValidationIssueCode = z.infer<typeof validationIssueCodeSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type LlmApiFormat = z.infer<typeof llmApiFormatSchema>;
export type ModSource = z.infer<typeof modSourceSchema>;
export type ModOrderRecommendationAction = z.infer<
  typeof modOrderRecommendationActionSchema
>;
export type ModOrderEdgeKind = z.infer<typeof modOrderEdgeKindSchema>;
export type ModOrderEdgeSource = z.infer<typeof modOrderEdgeSourceSchema>;
export type ModOrderSeverity = z.infer<typeof modOrderSeveritySchema>;
export type ModOrderDiagnosticCode = z.infer<
  typeof modOrderDiagnosticCodeSchema
>;
export type ExecutionEnvironment = z.infer<typeof executionEnvironmentSchema>;
export type AppError = z.infer<typeof appErrorSchema>;
export type DetectedPath = z.infer<typeof detectedPathSchema>;
export type PathSelection = z.infer<typeof pathSelectionSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type LlmModelPricing = z.infer<typeof llmModelPricingSchema>;
export type LlmModelMetadata = z.infer<typeof llmModelMetadataSchema>;
export type LlmModelMetadataSelection = z.infer<
  typeof llmModelMetadataSelectionSchema
>;
export type LlmModelConfig = z.infer<typeof llmModelConfigSchema>;
export type LlmProviderConfig = z.infer<typeof llmProviderConfigSchema>;
export type LlmSettings = z.infer<typeof llmSettingsSchema>;
export type LlmModelMetadataMatch = z.infer<typeof llmModelMetadataMatchSchema>;
export type ModDependencyMetadata = z.infer<typeof modDependencyMetadataSchema>;
export type CurrentGameLanguageSource = z.infer<
  typeof currentGameLanguageSourceSchema
>;
export type CurrentGameLanguage = z.infer<typeof currentGameLanguageSchema>;
export type ModLocalizationKind = z.infer<typeof modLocalizationKindSchema>;
export type ModLocalizationCompleteness = z.infer<
  typeof modLocalizationCompletenessSchema
>;
export type ModLocalizationCoverage = z.infer<
  typeof modLocalizationCoverageSchema
>;
export type ModLocalizationStatus = z.infer<typeof modLocalizationStatusSchema>;
export type ModRecord = z.infer<typeof modRecordSchema>;
export type ModSourceSnapshotEntry = z.infer<
  typeof modSourceSnapshotEntrySchema
>;
export type ModSourceSnapshot = z.infer<typeof modSourceSnapshotSchema>;
export type ModOrderEdge = z.infer<typeof modOrderEdgeSchema>;
export type ModOrderDiagnostic = z.infer<typeof modOrderDiagnosticSchema>;
export type ModOrderDependencyIssue = z.infer<
  typeof modOrderDependencyIssueSchema
>;
export type ModOrderExplanation = z.infer<typeof modOrderExplanationSchema>;
export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;
export type ModProfileSummary = z.infer<typeof modProfileSummarySchema>;
export type ProfileCatalogResult = z.infer<typeof profileCatalogResultSchema>;
export type ProfileScopedInput = z.infer<typeof profileScopedInputSchema>;
export type ModLocalizationSnapshotInput = z.infer<
  typeof modLocalizationSnapshotInputSchema
>;
export type ModLocalizationProgressState = z.infer<
  typeof modLocalizationProgressStateSchema
>;
export type ModLocalizationProgressInput = z.infer<
  typeof modLocalizationProgressInputSchema
>;
export type ModLocalizationProgress = z.infer<
  typeof modLocalizationProgressSchema
>;
export type ModLocalizationSnapshotEntry = z.infer<
  typeof modLocalizationSnapshotEntrySchema
>;
export type ModLocalizationSnapshot = z.infer<
  typeof modLocalizationSnapshotSchema
>;
export type ModLibraryResult = z.infer<typeof modLibraryResultSchema>;
export type ModOrderAnalysisResult = z.infer<
  typeof modOrderAnalysisResultSchema
>;
export type DetectPathsInput = z.infer<typeof detectPathsInputSchema>;
export type DetectPathsResult = z.infer<typeof detectPathsResultSchema>;
export type ValidatePathInput = z.infer<typeof validatePathInputSchema>;
export type ValidatePathResult = z.infer<typeof validatePathResultSchema>;
export type SaveSettingsInput = z.infer<typeof saveSettingsInputSchema>;
export type SaveSettingsResult = z.infer<typeof saveSettingsResultSchema>;
export type SaveLlmSettingsInput = z.infer<typeof saveLlmSettingsInputSchema>;
export type SearchModelMetadataInput = z.infer<
  typeof searchModelMetadataInputSchema
>;
export type SearchModelMetadataResult = z.infer<
  typeof searchModelMetadataResultSchema
>;
export type CreateProfileInput = z.infer<typeof createProfileInputSchema>;
export type RenameProfileInput = z.infer<typeof renameProfileInputSchema>;
export type DeleteProfileInput = z.infer<typeof deleteProfileInputSchema>;
export type SwitchProfileInput = z.infer<typeof switchProfileInputSchema>;
export type SaveProfileInput = z.infer<typeof saveProfileInputSchema>;
export type SaveProfileResult = z.infer<typeof saveProfileResultSchema>;
export type ApplyActivePackageIdsInput = z.infer<
  typeof applyActivePackageIdsInputSchema
>;
export type ApplyActivePackageIdsResult = z.infer<
  typeof applyActivePackageIdsResultSchema
>;
export type I18nDictionariesPayload = z.infer<typeof i18nDictionariesSchema>;
