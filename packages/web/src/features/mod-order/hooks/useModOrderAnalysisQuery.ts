import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { useQuery } from "@tanstack/react-query";

export function useModOrderAnalysisQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["mod-order-analysis"],
    enabled,
    queryFn: async () => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.analyzeModOrder();
    },
  });
}
