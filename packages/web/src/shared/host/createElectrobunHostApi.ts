import type { RimunHostApi, RimunRpc } from "@rimun/shared";

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
          reject(
            new Error("Electrobun RPC socket closed before it was ready."),
          );
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

export async function createElectrobunHostApi(): Promise<RimunHostApi> {
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

  if (!("bunSocket" in (electroview as unknown as object))) {
    throw new Error(
      "Electrobun bunSocket is not available in this renderer context.",
    );
  }

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
    getI18nDictionaries: async () =>
      callWithReadySocket(() => typedRpc.request.getI18nDictionaries({})),
    getProfileCatalog: async () =>
      callWithReadySocket(() => typedRpc.request.getProfileCatalog({})),
    createProfile: async (input) =>
      callWithReadySocket(() => typedRpc.request.createProfile(input)),
    renameProfile: async (input) =>
      callWithReadySocket(() => typedRpc.request.renameProfile(input)),
    saveProfile: async (input) =>
      callWithReadySocket(() => typedRpc.request.saveProfile(input)),
    deleteProfile: async (input) =>
      callWithReadySocket(() => typedRpc.request.deleteProfile(input)),
    switchProfile: async (input) =>
      callWithReadySocket(() => typedRpc.request.switchProfile(input)),
    getModSourceSnapshot: async (input) =>
      callWithReadySocket(() => typedRpc.request.getModSourceSnapshot(input)),
    getModLocalizationSnapshot: async (input) =>
      callWithReadySocket(() =>
        typedRpc.request.getModLocalizationSnapshot(input),
      ),
    getModLocalizationProgress: async (input) =>
      callWithReadySocket(() =>
        typedRpc.request.getModLocalizationProgress(input),
      ),
    getSettings: async () =>
      callWithReadySocket(() => typedRpc.request.getSettings({})),
    saveSettings: async (input) =>
      callWithReadySocket(() => typedRpc.request.saveSettings(input)),
    getLlmSettings: async () =>
      callWithReadySocket(() => typedRpc.request.getLlmSettings({})),
    saveLlmSettings: async (input) =>
      callWithReadySocket(() => typedRpc.request.saveLlmSettings(input)),
    searchModelMetadata: async (input) =>
      callWithReadySocket(() => typedRpc.request.searchModelMetadata(input)),
    detectPaths: async (input) =>
      callWithReadySocket(() => typedRpc.request.detectPaths(input)),
    validatePath: async (input) =>
      callWithReadySocket(() => typedRpc.request.validatePath(input)),
    applyActivePackageIds: async (input) =>
      callWithReadySocket(() => typedRpc.request.applyActivePackageIds(input)),
  };
}
