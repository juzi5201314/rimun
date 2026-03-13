import type {
  AppSettings,
  ApplyModOrderRecommendationInput,
  BootstrapPayload,
  CreateProfileInput,
  DeleteProfileInput,
  DetectPathsInput,
  DetectPathsResult,
  EmptyParams,
  ModLibraryResult,
  ModOrderAnalysisResult,
  ModOrderApplyResult,
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
  applyModOrderRecommendationInputSchema,
  bootstrapPayloadSchema,
  createProfileInputSchema,
  deleteProfileInputSchema,
  detectPathsInputSchema,
  detectPathsResultSchema,
  emptyParamsSchema,
  modLibraryResultSchema,
  modOrderAnalysisResultSchema,
  modOrderApplyResultSchema,
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

export type RimunBunRequests = {
  getBootstrap: RpcRequestDefinition<EmptyParams, BootstrapPayload>;
  getProfileCatalog: RpcRequestDefinition<EmptyParams, ProfileCatalogResult>;
  createProfile: RpcRequestDefinition<CreateProfileInput, ProfileCatalogResult>;
  renameProfile: RpcRequestDefinition<RenameProfileInput, ProfileCatalogResult>;
  saveProfile: RpcRequestDefinition<SaveProfileInput, SaveProfileResult>;
  deleteProfile: RpcRequestDefinition<DeleteProfileInput, ProfileCatalogResult>;
  switchProfile: RpcRequestDefinition<SwitchProfileInput, ProfileCatalogResult>;
  getModLibrary: RpcRequestDefinition<ProfileScopedInput, ModLibraryResult>;
  analyzeModOrder: RpcRequestDefinition<
    ProfileScopedInput,
    ModOrderAnalysisResult
  >;
  applyModOrderRecommendation: RpcRequestDefinition<
    ApplyModOrderRecommendationInput,
    ModOrderApplyResult
  >;
  getSettings: RpcRequestDefinition<EmptyParams, AppSettings>;
  saveSettings: RpcRequestDefinition<SaveSettingsInput, SaveSettingsResult>;
  detectPaths: RpcRequestDefinition<DetectPathsInput, DetectPathsResult>;
  validatePath: RpcRequestDefinition<ValidatePathInput, ValidatePathResult>;
};

export type RimunBunMessages = Record<never, never>;

export type RimunWebviewRequests = Record<never, never>;

export type RimunWebviewMessages = {
  settingsUpdated: RpcMessageDefinition<{ settings: AppSettings }>;
  pathDetectionCompleted: RpcMessageDefinition<{ result: DetectPathsResult }>;
};

export type RimunRpcContract = {
  bun: RpcSchema<RimunBunRequests, RimunBunMessages>;
  webview: RpcSchema<RimunWebviewRequests, RimunWebviewMessages>;
};

export type RimunRpc = RimunRpcContract;

// 统一导出 schema map，方便 desktop/web 在 bridge 边界做运行时校验。
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
      getModLibrary: {
        params: profileScopedInputSchema,
        response: modLibraryResultSchema,
      },
      analyzeModOrder: {
        params: profileScopedInputSchema,
        response: modOrderAnalysisResultSchema,
      },
      applyModOrderRecommendation: {
        params: applyModOrderRecommendationInputSchema,
        response: modOrderApplyResultSchema,
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
    },
    messages: {},
  },
  webview: {
    requests: {},
    messages: {
      settingsUpdated: {
        payload: emptyParamsSchema.extend({
          settings: appSettingsSchema,
        }),
      },
      pathDetectionCompleted: {
        payload: emptyParamsSchema.extend({
          result: detectPathsResultSchema,
        }),
      },
    },
  },
} as const;
