import { AppProviders } from "@/app/AppProviders";
import { createAppRouter } from "@/app/router";
import { useState } from "react";
import { RouterProvider } from "react-router-dom";

export function App() {
  const [router] = useState(() => createAppRouter());

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
