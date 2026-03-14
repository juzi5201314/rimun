import { useHostApi } from "@/shared/host/HostApiProvider";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { SaveLlmSettingsInput } from "@rimun/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useSaveLlmSettingsMutation() {
  const queryClient = useQueryClient();
  const getHostApi = useHostApi();

  return useMutation({
    mutationFn: async (input: SaveLlmSettingsInput) => {
      const hostApi = await getHostApi();
      return hostApi.saveLlmSettings(input);
    },
    onSuccess: async (savedSettings) => {
      queryClient.setQueryData(queryKeys.llmSettings(), savedSettings);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.llmSettings(),
      });
    },
  });
}
