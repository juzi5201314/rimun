import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
import { queryKeys } from "@/shared/lib/queryKeys";
import type { SaveSettingsInput } from "@rimun/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useSaveSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveSettingsInput) => {
      const rpcClient = await getRimunRpcClient();
      return rpcClient.saveSettings(input);
    },
    onSuccess: async (savedSettings) => {
      queryClient.setQueryData(queryKeys.settings(), savedSettings.settings);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap() });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modLibraryRoot(),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.modOrderAnalysisRoot(),
      });
    },
  });
}
