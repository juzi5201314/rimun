import { useHostApi } from "@/shared/host/HostApiProvider";
import type {
  SearchModelMetadataInput,
  SearchModelMetadataResult,
} from "@rimun/shared";
import { useCallback } from "react";

export function useSearchModelMetadata() {
  const getHostApi = useHostApi();

  return useCallback(
    async (
      input: SearchModelMetadataInput,
    ): Promise<SearchModelMetadataResult> => {
      const hostApi = await getHostApi();
      return hostApi.searchModelMetadata(input);
    },
    [getHostApi],
  );
}
