import { useHostApi } from "@/shared/host/HostApiProvider";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useSettingsQuery() {
  const getHostApi = useHostApi();

  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: async () => {
      const hostApi = await getHostApi();
      return hostApi.getSettings();
    },
  });
}
