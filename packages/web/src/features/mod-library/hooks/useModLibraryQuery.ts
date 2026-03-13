import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useModLibraryQuery(profileId: string | null) {
  return useQuery({
    queryKey: profileId
      ? queryKeys.modLibrary(profileId)
      : queryKeys.modLibraryRoot(),
    enabled: profileId !== null,
    queryFn: async () => {
      if (!profileId) {
        throw new Error("Profile id is required to load the mod library.");
      }

      const rpcClient = await getRimunRpcClient();
      return rpcClient.getModLibrary({ profileId });
    },
  });
}
