import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { useQuery } from "@tanstack/react-query";

export function useBootstrapQuery() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: async () => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.getBootstrap();
    },
  });
}
