import { join } from "node:path";

export const APP_NAME = "rimun";
export const DATABASE_FILENAME = "rimun.sqlite";
export const DEFAULT_WINDOW_SIZE = {
  width: 1280,
  height: 800,
} as const;

export function resolveMainWindowUrl() {
  const devServerUrl = process.env["RIMUN_DEV_SERVER_URL"]?.trim();

  if (devServerUrl) {
    return devServerUrl;
  }

  return "views://app/index.html";
}

export function resolveWorkspaceRoot() {
  return (
    process.env["RIMUN_DEV_WORKSPACE_ROOT"] ??
    join(import.meta.dir, "..", "..", "..", "..")
  );
}
