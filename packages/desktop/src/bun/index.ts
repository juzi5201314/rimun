import { BrowserWindow } from "electrobun/bun";
import { DEFAULT_WINDOW_SIZE, resolveMainWindowUrl } from "./config";
import { SettingsRepository } from "./persistence";
import { createMainWindowRpc } from "./rpc";

const settingsRepository = new SettingsRepository();

let mainWindow: BrowserWindow | null = null;

const rpc = createMainWindowRpc(settingsRepository, () => mainWindow);

mainWindow = new BrowserWindow({
  title: "rimun",
  url: resolveMainWindowUrl(),
  rpc,
  frame: {
    width: DEFAULT_WINDOW_SIZE.width,
    height: DEFAULT_WINDOW_SIZE.height,
    x: 80,
    y: 80,
  },
});

console.log(`rimun desktop started with ${resolveMainWindowUrl()}`);
