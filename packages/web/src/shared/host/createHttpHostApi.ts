import type { RimunHostApi } from "@rimun/shared";

async function callHost<T>(method: string, payload: unknown): Promise<T> {
  const response = await fetch(`/api/rimun/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as
    | T
    | {
        error?: {
          message?: string;
        };
      };

  if (!response.ok) {
    throw new Error(
      (data as { error?: { message?: string } }).error?.message ??
        "Host request failed.",
    );
  }

  return data as T;
}

export function createHttpHostApi(): RimunHostApi {
  return {
    getBootstrap: () => callHost("getBootstrap", {}),
    getI18nDictionaries: () => callHost("getI18nDictionaries", {}),
    getProfileCatalog: () => callHost("getProfileCatalog", {}),
    createProfile: (input) => callHost("createProfile", input),
    renameProfile: (input) => callHost("renameProfile", input),
    saveProfile: (input) => callHost("saveProfile", input),
    deleteProfile: (input) => callHost("deleteProfile", input),
    switchProfile: (input) => callHost("switchProfile", input),
    getModSourceSnapshot: (input) => callHost("getModSourceSnapshot", input),
    getSettings: () => callHost("getSettings", {}),
    saveSettings: (input) => callHost("saveSettings", input),
    getLlmSettings: () => callHost("getLlmSettings", {}),
    saveLlmSettings: (input) => callHost("saveLlmSettings", input),
    searchModelMetadata: (input) => callHost("searchModelMetadata", input),
    detectPaths: (input) => callHost("detectPaths", input),
    validatePath: (input) => callHost("validatePath", input),
    applyActivePackageIds: (input) => callHost("applyActivePackageIds", input),
  };
}
