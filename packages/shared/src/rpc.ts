import type {
  AppSettings,
  ApplyActivePackageIdsInput,
  ApplyActivePackageIdsResult,
  BootstrapPayload,
  CreateProfileInput,
  DeleteProfileInput,
  DetectPathsInput,
  DetectPathsResult,
  EmptyParams,
  I18nDictionariesPayload,
  LlmSettings,
  ModLocalizationProgress,
  ModLocalizationProgressInput,
  ModLocalizationSnapshot,
  ModLocalizationSnapshotInput,
  ModSourceSnapshot,
  ProfileCatalogResult,
  ProfileScopedInput,
  RenameProfileInput,
  SaveLlmSettingsInput,
  SaveProfileInput,
  SaveProfileResult,
  SaveSettingsInput,
  SaveSettingsResult,
  SearchModelMetadataInput,
  SearchModelMetadataResult,
  SwitchProfileInput,
  ValidatePathInput,
  ValidatePathResult,
} from "./schemas";
import {
  appSettingsSchema,
  applyActivePackageIdsInputSchema,
  applyActivePackageIdsResultSchema,
  bootstrapPayloadSchema,
  createProfileInputSchema,
  deleteProfileInputSchema,
  detectPathsInputSchema,
  detectPathsResultSchema,
  emptyParamsSchema,
  i18nDictionariesSchema,
  llmSettingsSchema,
  modLocalizationProgressInputSchema,
  modLocalizationProgressSchema,
  modLocalizationSnapshotInputSchema,
  modLocalizationSnapshotSchema,
  modSourceSnapshotSchema,
  profileCatalogResultSchema,
  profileScopedInputSchema,
  renameProfileInputSchema,
  saveLlmSettingsInputSchema,
  saveProfileInputSchema,
  saveProfileResultSchema,
  saveSettingsInputSchema,
  saveSettingsResultSchema,
  searchModelMetadataInputSchema,
  searchModelMetadataResultSchema,
  switchProfileInputSchema,
  validatePathInputSchema,
  validatePathResultSchema,
} from "./schemas";

export type RpcRequestDefinition<TParams, TResponse> = {
  params: TParams;
  response: TResponse;
};

export type RpcMessageDefinition<TPayload> = {
  payload: TPayload;
};

export type RpcSchema<
  TRequests extends Record<string, RpcRequestDefinition<unknown, unknown>>,
  TMessages extends Record<string, RpcMessageDefinition<unknown>>,
> = {
  requests: TRequests;
  messages: TMessages;
};

export type RimunHostRequests = {
  getBootstrap: RpcRequestDefinition<EmptyParams, BootstrapPayload>;
  getI18nDictionaries: RpcRequestDefinition<
    EmptyParams,
    I18nDictionariesPayload
  >;
  getProfileCatalog: RpcRequestDefinition<EmptyParams, ProfileCatalogResult>;
  createProfile: RpcRequestDefinition<CreateProfileInput, ProfileCatalogResult>;
  renameProfile: RpcRequestDefinition<RenameProfileInput, ProfileCatalogResult>;
  saveProfile: RpcRequestDefinition<SaveProfileInput, SaveProfileResult>;
  deleteProfile: RpcRequestDefinition<DeleteProfileInput, ProfileCatalogResult>;
  switchProfile: RpcRequestDefinition<SwitchProfileInput, ProfileCatalogResult>;
  getModSourceSnapshot: RpcRequestDefinition<
    ProfileScopedInput,
    ModSourceSnapshot
  >;
  getModLocalizationSnapshot: RpcRequestDefinition<
    ModLocalizationSnapshotInput,
    ModLocalizationSnapshot
  >;
  getModLocalizationProgress: RpcRequestDefinition<
    ModLocalizationProgressInput,
    ModLocalizationProgress
  >;
  getSettings: RpcRequestDefinition<EmptyParams, AppSettings>;
  saveSettings: RpcRequestDefinition<SaveSettingsInput, SaveSettingsResult>;
  getLlmSettings: RpcRequestDefinition<EmptyParams, LlmSettings>;
  saveLlmSettings: RpcRequestDefinition<SaveLlmSettingsInput, LlmSettings>;
  searchModelMetadata: RpcRequestDefinition<
    SearchModelMetadataInput,
    SearchModelMetadataResult
  >;
  detectPaths: RpcRequestDefinition<DetectPathsInput, DetectPathsResult>;
  validatePath: RpcRequestDefinition<ValidatePathInput, ValidatePathResult>;
  applyActivePackageIds: RpcRequestDefinition<
    ApplyActivePackageIdsInput,
    ApplyActivePackageIdsResult
  >;
};

export type RimunHostMessages = Record<never, never>;

export type RimunHostContract = {
  bun: RpcSchema<RimunHostRequests, RimunHostMessages>;
  webview: RpcSchema<Record<never, never>, Record<never, never>>;
};

export type RimunRpc = RimunHostContract;

export type RimunHostApi = {
  getBootstrap(): Promise<BootstrapPayload>;
  getI18nDictionaries(): Promise<I18nDictionariesPayload>;
  getProfileCatalog(): Promise<ProfileCatalogResult>;
  createProfile(input: CreateProfileInput): Promise<ProfileCatalogResult>;
  renameProfile(input: RenameProfileInput): Promise<ProfileCatalogResult>;
  saveProfile(input: SaveProfileInput): Promise<SaveProfileResult>;
  deleteProfile(input: DeleteProfileInput): Promise<ProfileCatalogResult>;
  switchProfile(input: SwitchProfileInput): Promise<ProfileCatalogResult>;
  getModSourceSnapshot(input: ProfileScopedInput): Promise<ModSourceSnapshot>;
  getModLocalizationSnapshot(
    input: ModLocalizationSnapshotInput,
  ): Promise<ModLocalizationSnapshot>;
  getModLocalizationProgress(
    input: ModLocalizationProgressInput,
  ): Promise<ModLocalizationProgress>;
  getSettings(): Promise<AppSettings>;
  saveSettings(input: SaveSettingsInput): Promise<SaveSettingsResult>;
  getLlmSettings(): Promise<LlmSettings>;
  saveLlmSettings(input: SaveLlmSettingsInput): Promise<LlmSettings>;
  searchModelMetadata(
    input: SearchModelMetadataInput,
  ): Promise<SearchModelMetadataResult>;
  detectPaths(input: DetectPathsInput): Promise<DetectPathsResult>;
  validatePath(input: ValidatePathInput): Promise<ValidatePathResult>;
  applyActivePackageIds(
    input: ApplyActivePackageIdsInput,
  ): Promise<ApplyActivePackageIdsResult>;
};

export const rimunRpcSchemas = {
  bun: {
    requests: {
      getBootstrap: {
        params: emptyParamsSchema,
        response: bootstrapPayloadSchema,
      },
      getI18nDictionaries: {
        params: emptyParamsSchema,
        response: i18nDictionariesSchema,
      },
      getProfileCatalog: {
        params: emptyParamsSchema,
        response: profileCatalogResultSchema,
      },
      createProfile: {
        params: createProfileInputSchema,
        response: profileCatalogResultSchema,
      },
      renameProfile: {
        params: renameProfileInputSchema,
        response: profileCatalogResultSchema,
      },
      saveProfile: {
        params: saveProfileInputSchema,
        response: saveProfileResultSchema,
      },
      deleteProfile: {
        params: deleteProfileInputSchema,
        response: profileCatalogResultSchema,
      },
      switchProfile: {
        params: switchProfileInputSchema,
        response: profileCatalogResultSchema,
      },
      getModSourceSnapshot: {
        params: profileScopedInputSchema,
        response: modSourceSnapshotSchema,
      },
      getModLocalizationSnapshot: {
        params: modLocalizationSnapshotInputSchema,
        response: modLocalizationSnapshotSchema,
      },
      getModLocalizationProgress: {
        params: modLocalizationProgressInputSchema,
        response: modLocalizationProgressSchema,
      },
      getSettings: {
        params: emptyParamsSchema,
        response: appSettingsSchema,
      },
      saveSettings: {
        params: saveSettingsInputSchema,
        response: saveSettingsResultSchema,
      },
      getLlmSettings: {
        params: emptyParamsSchema,
        response: llmSettingsSchema,
      },
      saveLlmSettings: {
        params: saveLlmSettingsInputSchema,
        response: llmSettingsSchema,
      },
      searchModelMetadata: {
        params: searchModelMetadataInputSchema,
        response: searchModelMetadataResultSchema,
      },
      detectPaths: {
        params: detectPathsInputSchema,
        response: detectPathsResultSchema,
      },
      validatePath: {
        params: validatePathInputSchema,
        response: validatePathResultSchema,
      },
      applyActivePackageIds: {
        params: applyActivePackageIdsInputSchema,
        response: applyActivePackageIdsResultSchema,
      },
    },
    messages: {},
  },
  webview: {
    requests: {},
    messages: {},
  },
} as const;
