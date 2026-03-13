import { AppProviders } from "@/app/AppProviders";
import { createAppRouter } from "@/app/router";
import type { RimunHostApi } from "@rimun/shared";
import { useState } from "react";
import { RouterProvider } from "react-router-dom";

export function App({
  hostApi,
  router,
}: {
  hostApi?: RimunHostApi;
  router?: ReturnType<typeof createAppRouter>;
}) {
  const [appRouter] = useState(() => router ?? createAppRouter());

  return (
    <AppProviders hostApi={hostApi}>
      <RouterProvider router={appRouter} />
    </AppProviders>
  );
}
