import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useBootstrapQuery() {
  return useQuery({
    queryKey: queryKeys.bootstrap(),
    queryFn: async () => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.getBootstrap();
    },
  });
}
