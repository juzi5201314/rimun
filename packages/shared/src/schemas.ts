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

export const bootstrapPayloadSchema = z.object({
  environment: executionEnvironmentSchema,
  settings: appSettingsSchema,
  supportedChannels: z.array(distributionChannelSchema).min(1),
  preferredSelection: pathSelectionSchema.nullable(),
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
export type ExecutionEnvironment = z.infer<typeof executionEnvironmentSchema>;
export type AppError = z.infer<typeof appErrorSchema>;
export type DetectedPath = z.infer<typeof detectedPathSchema>;
export type PathSelection = z.infer<typeof pathSelectionSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;
export type DetectPathsInput = z.infer<typeof detectPathsInputSchema>;
export type DetectPathsResult = z.infer<typeof detectPathsResultSchema>;
export type ValidatePathInput = z.infer<typeof validatePathInputSchema>;
export type ValidatePathResult = z.infer<typeof validatePathResultSchema>;
export type SaveSettingsInput = z.infer<typeof saveSettingsInputSchema>;
export type SaveSettingsResult = z.infer<typeof saveSettingsResultSchema>;
