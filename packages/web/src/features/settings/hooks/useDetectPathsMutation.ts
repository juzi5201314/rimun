import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import type { DetectPathsInput } from "@rimun/shared";
import { useMutation } from "@tanstack/react-query";

export function useDetectPathsMutation() {
  return useMutation({
    mutationFn: async (input: DetectPathsInput) => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.detectPaths(input);
    },
  });
}
