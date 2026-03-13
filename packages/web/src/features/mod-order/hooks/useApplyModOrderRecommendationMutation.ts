import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import type { ApplyModOrderRecommendationInput } from "@rimun/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useApplyModOrderRecommendationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ApplyModOrderRecommendationInput) => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.applyModOrderRecommendation(input);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(["mod-library"], result.modLibrary);
      queryClient.setQueryData(["mod-order-analysis"], result.analysis);
      await queryClient.invalidateQueries({ queryKey: ["mod-library"] });
      await queryClient.invalidateQueries({ queryKey: ["mod-order-analysis"] });
    },
  });
}
