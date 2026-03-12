import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { Link, Outlet, createBrowserRouter } from "react-router-dom";

function RootLayout() {
  return (
    <main>
      <header>
        <h1>rimun</h1>
        <p>RimWorld mod manager desktop shell</p>
        <nav aria-label="Primary">
          <Link to="/">Home</Link> <Link to="/settings">Settings</Link>
        </nav>
      </header>

      <hr />

      <Outlet />
    </main>
  );
}

export function createAppRouter() {
  return createBrowserRouter([
    {
      path: "/",
      element: <RootLayout />,
      children: [
        {
          index: true,
          element: <HomePage />,
        },
        {
          path: "settings",
          element: <SettingsPage />,
        },
      ],
    },
  ]);
}
