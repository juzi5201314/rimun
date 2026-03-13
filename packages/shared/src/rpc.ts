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
  ModSourceSnapshot,
  ProfileCatalogResult,
  ProfileScopedInput,
  RenameProfileInput,
  SaveProfileInput,
  SaveProfileResult,
  SaveSettingsInput,
  SaveSettingsResult,
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
  modSourceSnapshotSchema,
  profileCatalogResultSchema,
  profileScopedInputSchema,
  renameProfileInputSchema,
  saveProfileInputSchema,
  saveProfileResultSchema,
  saveSettingsInputSchema,
  saveSettingsResultSchema,
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
  getSettings: RpcRequestDefinition<EmptyParams, AppSettings>;
  saveSettings: RpcRequestDefinition<SaveSettingsInput, SaveSettingsResult>;
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
  getProfileCatalog(): Promise<ProfileCatalogResult>;
  createProfile(input: CreateProfileInput): Promise<ProfileCatalogResult>;
  renameProfile(input: RenameProfileInput): Promise<ProfileCatalogResult>;
  saveProfile(input: SaveProfileInput): Promise<SaveProfileResult>;
  deleteProfile(input: DeleteProfileInput): Promise<ProfileCatalogResult>;
  switchProfile(input: SwitchProfileInput): Promise<ProfileCatalogResult>;
  getModSourceSnapshot(input: ProfileScopedInput): Promise<ModSourceSnapshot>;
  getSettings(): Promise<AppSettings>;
  saveSettings(input: SaveSettingsInput): Promise<SaveSettingsResult>;
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
      getSettings: {
        params: emptyParamsSchema,
        response: appSettingsSchema,
      },
      saveSettings: {
        params: saveSettingsInputSchema,
        response: saveSettingsResultSchema,
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
