import { useHostApi } from "@/shared/host/HostApiProvider";
import { queryKeys } from "@/shared/lib/queryKeys";
import { useQuery } from "@tanstack/react-query";

export function useBootstrapQuery() {
  const getHostApi = useHostApi();

  return useQuery({
    queryKey: queryKeys.bootstrap(),
    queryFn: async () => {
      const hostApi = await getHostApi();
      return hostApi.getBootstrap();
    },
  });
}
