import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { cn } from "@/shared/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Settings,
  Shield,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import {
  Link,
  Outlet,
  createBrowserRouter,
  createMemoryRouter,
  useLocation,
} from "react-router-dom";

function SidebarLink({
  to,
  icon: Icon,
  label,
  collapsed,
}: { to: string; icon: React.ElementType; label: string; collapsed: boolean }) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center border-l-4 text-sm font-medium transition-all",
        collapsed ? "justify-center px-0 py-4" : "gap-3 px-5 py-3.5",
        isActive
          ? "border-primary bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 shrink-0",
          isActive ? "text-primary" : "text-muted-foreground",
        )}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function RootLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      <aside
        className={cn(
          "relative flex shrink-0 flex-col border-r border-border bg-card/50 transition-all duration-300",
          isCollapsed ? "w-16" : "w-60",
        )}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute right-0 top-10 z-30 flex h-8 w-8 translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </button>

        <div
          className={cn(
            "shrink-0 overflow-hidden border-b border-border/60",
            isCollapsed ? "p-4" : "p-6",
          )}
        >
          <h1
            className={cn(
              "font-black tracking-tighter text-primary transition-all rw-text",
              isCollapsed ? "text-center text-xl" : "text-2xl",
            )}
          >
            {isCollapsed ? "R" : "rimun"}
          </h1>
          {!isCollapsed && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                System Active
              </p>
            </div>
          )}
        </div>

        <nav className="no-scrollbar flex flex-1 flex-col overflow-y-auto py-3">
          <SidebarLink
            to="/"
            icon={List}
            label="Mod Library"
            collapsed={isCollapsed}
          />
          <SidebarLink
            to="/settings"
            icon={Settings}
            label="Settings"
            collapsed={isCollapsed}
          />
        </nav>

        <div
          className={cn(
            "flex shrink-0 flex-col gap-3 overflow-hidden border-t border-border/60 text-xs text-muted-foreground",
            isCollapsed ? "items-center p-4" : "p-5",
          )}
        >
          <div className="flex items-center gap-2" title="Dev Console">
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Dev Console</span>}
          </div>
          <div className="flex items-center gap-2" title="Integrity Verified">
            <Shield className="w-3.5 h-3.5 text-primary/40 shrink-0" />
            {!isCollapsed && <span>Verified</span>}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-background/5 relative overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}

const routes = [
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
];

export function createAppRouter(options?: {
  kind?: "browser" | "memory";
  initialEntries?: string[];
}) {
  if (options?.kind === "memory") {
    return createMemoryRouter(routes, {
      initialEntries: options.initialEntries ?? ["/"],
    });
  }

  return createBrowserRouter(routes);
}
