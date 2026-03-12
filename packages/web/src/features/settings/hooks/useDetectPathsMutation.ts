import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { useMutation } from "@tanstack/react-query";

export function useDetectPathsMutation() {
  return useMutation({
    mutationFn: async () => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.detectPaths();
    },
  });
}
