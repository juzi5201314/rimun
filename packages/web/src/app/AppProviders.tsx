import { HostApiProvider } from "@/shared/host/HostApiProvider";
import type { RimunHostApi } from "@rimun/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useState } from "react";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 5_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function AppProviders({
  children,
  hostApi,
}: PropsWithChildren<{ hostApi?: RimunHostApi }>) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <HostApiProvider hostApi={hostApi}>{children}</HostApiProvider>
    </QueryClientProvider>
  );
}
