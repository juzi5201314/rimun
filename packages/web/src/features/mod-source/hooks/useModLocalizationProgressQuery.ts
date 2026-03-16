import { useHostApi } from "@/shared/host/HostApiProvider";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { ModSourceSnapshot } from "@rimun/shared";
import { useQuery } from "@tanstack/react-query";

export function useModLocalizationProgressQuery(
  profileId: string | null,
  modSourceSnapshot: ModSourceSnapshot | undefined,
  isPending: boolean,
) {
  const getHostApi = useHostApi();
  const snapshotScannedAt = modSourceSnapshot?.scannedAt ?? null;
  const isEnabled =
    isPending &&
    profileId !== null &&
    snapshotScannedAt !== null &&
    !modSourceSnapshot?.requiresConfiguration;

  return useQuery({
    queryKey:
      profileId && snapshotScannedAt
        ? queryKeys.modLocalizationProgress(profileId, snapshotScannedAt)
        : queryKeys.modLocalizationProgressRoot(),
    enabled: isEnabled,
    queryFn: async () => {
      if (!profileId || !snapshotScannedAt) {
        throw new Error(
          "Profile id and scanned snapshot timestamp are required to load localization progress.",
        );
      }

      const hostApi = await getHostApi();
      return hostApi.getModLocalizationProgress({
        profileId,
        snapshotScannedAt,
      });
    },
    refetchInterval: (query) =>
      query.state.data?.state === "pending" ? 250 : false,
    retry: false,
  });
}
