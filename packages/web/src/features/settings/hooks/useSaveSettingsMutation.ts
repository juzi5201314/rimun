import { getRimunRpcClient } from "@/shared/bridge/rpcClient";
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
      queryClient.setQueryData(["settings"], savedSettings.settings);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
}
