import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: async () => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.getSettings();
    },
  });
}
