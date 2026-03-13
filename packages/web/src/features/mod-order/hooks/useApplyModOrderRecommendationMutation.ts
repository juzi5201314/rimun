import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { ApplyModOrderRecommendationInput } from "@rimun/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useApplyModOrderRecommendationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ApplyModOrderRecommendationInput) => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.applyModOrderRecommendation(input);
    },
    onSuccess: async (result, variables) => {
      queryClient.setQueryData(
        queryKeys.modLibrary(variables.profileId),
        result.modLibrary,
      );
      queryClient.setQueryData(
        queryKeys.modOrderAnalysis(variables.profileId),
        result.analysis,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modLibrary(variables.profileId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modOrderAnalysis(variables.profileId),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.profileCatalog(),
      });
    },
  });
}
