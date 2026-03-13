import { useHostApi } from "@/shared/host/HostApiProvider";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useModSourceSnapshotQuery(profileId: string | null) {
  const getHostApi = useHostApi();

  return useQuery({
    queryKey: profileId
      ? queryKeys.modSourceSnapshot(profileId)
      : queryKeys.modSourceSnapshotRoot(),
    enabled: profileId !== null,
    queryFn: async () => {
      if (!profileId) {
        throw new Error("Profile id is required to load the mod source snapshot.");
      }

      const hostApi = await getHostApi();
      return hostApi.getModSourceSnapshot({ profileId });
    },
  });
}
