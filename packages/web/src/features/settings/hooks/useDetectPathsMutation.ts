import { useHostApi } from "@/shared/host/HostApiProvider";
import type { DetectPathsInput } from "@rimun/shared";
import { useMutation } from "@tanstack/react-query";

export function useDetectPathsMutation() {
  const getHostApi = useHostApi();

  return useMutation({
    mutationFn: async (input: DetectPathsInput) => {
      const hostApi = await getHostApi();
      return hostApi.detectPaths(input);
    },
  });
}
