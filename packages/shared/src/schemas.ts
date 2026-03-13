import { z } from "zod";

export const emptyParamsSchema = z.object({}).strict();

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
]);

export const windowsAbsolutePathSchema = z
  .string()
  .min(1, "Windows path is required")
  .regex(
    /^[A-Za-z]:[\\/].+/,
    "Expected an absolute Windows path such as C:\\Games\\RimWorld",
  );

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
  notes: z.array(z.string().min(1)).default([]),
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

export const modLibraryResultSchema = z.object({
  environment: executionEnvironmentSchema,
  selection: pathSelectionSchema.nullable(),
  scannedAt: isoDateTimeSchema,
  scannedRoots: z.object({
    installationModsPath: windowsAbsolutePathSchema.nullable(),
    workshopPath: windowsAbsolutePathSchema.nullable(),
    modsConfigPath: windowsAbsolutePathSchema.nullable(),
  }),
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

export const applyModOrderRecommendationInputSchema = z.object({
  actions: z.array(modOrderRecommendationActionSchema).min(1),
});

export const modOrderApplyResultSchema = z.object({
  appliedActions: z.array(modOrderRecommendationActionSchema).min(1),
  activePackageIds: z.array(z.string().trim().min(1)).default([]),
  modLibrary: modLibraryResultSchema,
  analysis: modOrderAnalysisResultSchema,
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

export type EmptyParams = z.infer<typeof emptyParamsSchema>;
export type ExecutionPlatform = z.infer<typeof executionPlatformSchema>;
export type DistributionChannel = z.infer<typeof distributionChannelSchema>;
export type PathKind = z.infer<typeof pathKindSchema>;
export type PathDiscoverySource = z.infer<typeof pathDiscoverySourceSchema>;
export type ValidationIssueCode = z.infer<typeof validationIssueCodeSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
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
export type ModDependencyMetadata = z.infer<typeof modDependencyMetadataSchema>;
export type ModRecord = z.infer<typeof modRecordSchema>;
export type ModOrderEdge = z.infer<typeof modOrderEdgeSchema>;
export type ModOrderDiagnostic = z.infer<typeof modOrderDiagnosticSchema>;
export type ModOrderDependencyIssue = z.infer<
  typeof modOrderDependencyIssueSchema
>;
export type ModOrderExplanation = z.infer<typeof modOrderExplanationSchema>;
export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;
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
export type ApplyModOrderRecommendationInput = z.infer<
  typeof applyModOrderRecommendationInputSchema
>;
export type ModOrderApplyResult = z.infer<typeof modOrderApplyResultSchema>;
