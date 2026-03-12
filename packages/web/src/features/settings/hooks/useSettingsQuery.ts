import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { useQuery } from "@tanstack/react-query";

export function useSettingsQuery() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.getSettings();
    },
  });
}
