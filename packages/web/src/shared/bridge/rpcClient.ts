import type {
  AppSettings,
  BootstrapPayload,
  DetectPathsResult,
  RimunRpc,
  SaveSettingsInput,
  SaveSettingsResult,
} from "@rimun/shared";

export type RimunRpcClient = {
  getBootstrap(): Promise<BootstrapPayload>;
  getSettings(): Promise<AppSettings>;
  saveSettings(input: SaveSettingsInput): Promise<SaveSettingsResult>;
  detectPaths(): Promise<DetectPathsResult>;
};

declare global {
  interface Window {
    __RIMUN_RPC__?: RimunRpcClient;
  }
}

let rpcClientPromise: Promise<RimunRpcClient> | undefined;

async function createElectrobunRpcClient(): Promise<RimunRpcClient> {
  const { Electroview } = await import("electrobun/view");
  const rpc = Electroview.defineRPC<RimunRpc>({
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

  return {
    getBootstrap: async () => typedRpc.request.getBootstrap({}),
    getSettings: async () => typedRpc.request.getSettings({}),
    saveSettings: async (input) => typedRpc.request.saveSettings(input),
    detectPaths: async () =>
      typedRpc.request.detectPaths({
        preferredChannels: ["steam"],
        allowFallbackToManual: true,
      }),
  };
}

export async function getRimunRpcClient(): Promise<RimunRpcClient> {
  if (typeof window !== "undefined" && window.__RIMUN_RPC__) {
    return window.__RIMUN_RPC__;
  }

  rpcClientPromise ??= createElectrobunRpcClient();

  return rpcClientPromise;
}
