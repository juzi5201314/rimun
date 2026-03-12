import type {
  AppSettings,
  BootstrapPayload,
  DetectPathsInput,
  DetectPathsResult,
  ModLibraryResult,
  RimunRpc,
  SaveSettingsInput,
  SaveSettingsResult,
  ValidatePathInput,
  ValidatePathResult,
} from "@rimun/shared";

export type RimunRpcClient = {
  getBootstrap(): Promise<BootstrapPayload>;
  getModLibrary(): Promise<ModLibraryResult>;
  getSettings(): Promise<AppSettings>;
  saveSettings(input: SaveSettingsInput): Promise<SaveSettingsResult>;
  detectPaths(input: DetectPathsInput): Promise<DetectPathsResult>;
  validatePath(input: ValidatePathInput): Promise<ValidatePathResult>;
};

declare global {
  interface Window {
    __RIMUN_RPC__?: RimunRpcClient;
  }
}

let rpcClientPromise: Promise<RimunRpcClient> | undefined;

async function waitForElectrobunSocket(
  electroview: { bunSocket?: WebSocket | null },
  timeoutMs = 3_000,
) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const socket = electroview.bunSocket;

    if (!socket) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      continue;
    }

    if (socket.readyState === WebSocket.OPEN) {
      return;
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      await new Promise<void>((resolve, reject) => {
        const activeSocket = socket;
        const remainingMs = Math.max(100, timeoutMs - (Date.now() - startTime));
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(
            new Error("Timed out while waiting for the Electrobun RPC socket."),
          );
        }, remainingMs);

        function cleanup() {
          window.clearTimeout(timeout);
          activeSocket.removeEventListener("open", handleOpen);
          activeSocket.removeEventListener("error", handleError);
          activeSocket.removeEventListener("close", handleClose);
        }

        function handleOpen() {
          cleanup();
          resolve();
        }

        function handleError() {
          cleanup();
          reject(new Error("Electrobun RPC socket failed to open."));
        }

        function handleClose() {
          cleanup();
          reject(new Error("Electrobun RPC socket closed before it was ready."));
        }

        activeSocket.addEventListener("open", handleOpen, { once: true });
        activeSocket.addEventListener("error", handleError, { once: true });
        activeSocket.addEventListener("close", handleClose, { once: true });
      });

      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  throw new Error("Electrobun RPC socket is not available.");
}

async function createElectrobunRpcClient(): Promise<RimunRpcClient> {
  const { Electroview } = await import("electrobun/view");
  const rpc = Electroview.defineRPC<RimunRpc>({
    maxRequestTime: 10_000,
    handlers: {
      requests: {},
      messages: {},
    },
  });

  const electroview = new Electroview({ rpc });
  const typedRpc = electroview.rpc;

  if (!typedRpc) {
    throw new Error(
      "Electrobun RPC bridge is not available in this renderer context.",
    );
  }

  async function callWithReadySocket<T>(operation: () => Promise<T>) {
    await waitForElectrobunSocket(
      electroview as { bunSocket?: WebSocket | null },
    );
    return operation();
  }

  return {
    getBootstrap: async () =>
      callWithReadySocket(() => typedRpc.request.getBootstrap({})),
    getModLibrary: async () =>
      callWithReadySocket(() => typedRpc.request.getModLibrary({})),
    getSettings: async () =>
      callWithReadySocket(() => typedRpc.request.getSettings({})),
    saveSettings: async (input) =>
      callWithReadySocket(() => typedRpc.request.saveSettings(input)),
    detectPaths: async (input) =>
      callWithReadySocket(() => typedRpc.request.detectPaths(input)),
    validatePath: async (input) =>
      callWithReadySocket(() => typedRpc.request.validatePath(input)),
  };
}

export async function getRimunRpcClient(): Promise<RimunRpcClient> {
  if (typeof window !== "undefined" && window.__RIMUN_RPC__) {
    return window.__RIMUN_RPC__;
  }

  rpcClientPromise ??= createElectrobunRpcClient();

  return rpcClientPromise;
}
