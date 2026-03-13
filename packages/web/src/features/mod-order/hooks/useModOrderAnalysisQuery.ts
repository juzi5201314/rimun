import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useModOrderAnalysisQuery(
  profileId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: profileId
      ? queryKeys.modOrderAnalysis(profileId)
      : queryKeys.modOrderAnalysisRoot(),
    enabled: enabled && profileId !== null,
    queryFn: async () => {
      if (!profileId) {
        throw new Error("Profile id is required to analyze mod order.");
      }

      const rpcClient = await getRimunRpcClient();
      return rpcClient.analyzeModOrder({ profileId });
    },
  });
}
