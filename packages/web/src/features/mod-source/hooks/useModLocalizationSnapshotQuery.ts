import { useHostApi } from "@/shared/host/HostApiProvider";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { ModSourceSnapshot } from "@rimun/shared";
import { useQuery } from "@tanstack/react-query";

export function useModLocalizationSnapshotQuery(
  profileId: string | null,
  modSourceSnapshot: ModSourceSnapshot | undefined,
) {
  const getHostApi = useHostApi();
  const snapshotScannedAt = modSourceSnapshot?.scannedAt ?? null;
  const isEnabled =
    profileId !== null &&
    snapshotScannedAt !== null &&
    !modSourceSnapshot?.requiresConfiguration;

  return useQuery({
    queryKey:
      profileId && snapshotScannedAt
        ? queryKeys.modLocalizationSnapshot(profileId, snapshotScannedAt)
        : queryKeys.modLocalizationSnapshotRoot(),
    enabled: isEnabled,
    queryFn: async () => {
      if (!profileId || !snapshotScannedAt) {
        throw new Error(
          "Profile id and scanned snapshot timestamp are required to load localization data.",
        );
      }

      const hostApi = await getHostApi();
      return hostApi.getModLocalizationSnapshot({
        profileId,
        snapshotScannedAt,
      });
    },
    retry: false,
  });
}
