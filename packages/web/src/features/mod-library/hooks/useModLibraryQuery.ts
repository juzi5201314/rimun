import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { useQuery } from "@tanstack/react-query";

export function useModLibraryQuery() {
  return useQuery({
    queryKey: ["mod-library"],
    queryFn: async () => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.getModLibrary();
    },
  });
}
