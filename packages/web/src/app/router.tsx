import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { cn } from "@/shared/lib/utils";
import { List, Settings, Shield, Terminal } from "lucide-react";
import {
  Link,
  Outlet,
  createBrowserRouter,
  useLocation,
} from "react-router-dom";

function SidebarLink({
  to,
  icon: Icon,
  label,
}: { to: string; icon: React.ElementType; label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 px-6 py-4 border-l-4 transition-all text-sm font-medium",
        isActive
          ? "bg-accent border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4",
          isActive ? "text-primary" : "text-muted-foreground",
        )}
      />
      {label}
    </Link>
  );
}

function RootLayout() {
  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-8 border-b border-border">
          <h1 className="text-3xl font-bold tracking-tighter">rimun</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 flex flex-col">
          <SidebarLink to="/" icon={List} label="Mod Library" />
          <SidebarLink to="/settings" icon={Settings} label="Settings" />
        </nav>

        <div className="p-6 border-t border-border text-xs text-muted-foreground flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-3 h-3" />
            <span>Dev Console</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-3 h-3 text-primary/60" />
            <span>Integrity Verified</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative overflow-hidden">
        <Outlet />
      </main>
    </div>
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
