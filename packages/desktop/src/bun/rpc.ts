import type { RimunRpc } from "@rimun/shared";
import { BrowserView } from "electrobun/bun";
import type { SettingsRepository } from "./persistence";
import { createRimunHostService } from "./host-service";

export function createMainWindowRpc(
  repository: SettingsRepository,
  _getWindow: () => unknown,
) {
  const hostService = createRimunHostService(repository);

  return BrowserView.defineRPC<RimunRpc>({
    maxRequestTime: 30_000,
    handlers: {
      requests: {
        getBootstrap: () => hostService.getBootstrap(),
        getProfileCatalog: () => hostService.getProfileCatalog(),
        createProfile: (payload) => hostService.createProfile(payload),
        renameProfile: (payload) => hostService.renameProfile(payload),
        saveProfile: (payload) => hostService.saveProfile(payload),
        deleteProfile: (payload) => hostService.deleteProfile(payload),
        switchProfile: (payload) => hostService.switchProfile(payload),
        getModSourceSnapshot: (payload) =>
          hostService.getModSourceSnapshot(payload),
        getSettings: () => hostService.getSettings(),
        saveSettings: (payload) => hostService.saveSettings(payload),
        detectPaths: (payload) => hostService.detectPaths(payload),
        validatePath: (payload) => hostService.validatePath(payload),
        applyActivePackageIds: (payload) =>
          hostService.applyActivePackageIds(payload),
      },
      messages: {},
    },
  });
}
