import { useHostApi } from "@/shared/host/HostApiProvider";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { SaveSettingsInput } from "@rimun/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useSaveSettingsMutation() {
  const queryClient = useQueryClient();
  const getHostApi = useHostApi();

  return useMutation({
    mutationFn: async (input: SaveSettingsInput) => {
      const hostApi = await getHostApi();
      return hostApi.saveSettings(input);
    },
    onSuccess: async (savedSettings) => {
      queryClient.setQueryData(queryKeys.settings(), savedSettings.settings);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap() });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modSourceSnapshotRoot(),
      });
    },
  });
}
