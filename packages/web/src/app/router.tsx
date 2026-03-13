import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { cn } from "@/shared/lib/utils";
import { ChevronLeft, ChevronRight, List, Settings, Shield, Terminal } from "lucide-react";
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
        "flex items-center transition-all text-sm font-medium border-l-4",
        collapsed ? "justify-center px-0 py-4" : "gap-3 px-6 py-4",
        isActive
          ? "bg-accent border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground hover:border-border",
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
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans select-none">
      {/* Sidebar */}
      <aside 
        className={cn(
          "border-r border-border bg-card/50 flex flex-col shrink-0 transition-all duration-300 relative group",
          isCollapsed ? "w-14" : "w-56"
        )}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-12 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        <div className={cn("border-b border-border/60 overflow-hidden shrink-0", isCollapsed ? "p-3" : "p-6")}>
          <h1 className={cn("font-black tracking-tighter transition-all rw-text text-primary", isCollapsed ? "text-xl text-center" : "text-2xl")}>
            {isCollapsed ? "R" : "rimun"}
          </h1>
          {!isCollapsed && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">System Active</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 flex flex-col no-scrollbar">
          <SidebarLink to="/" icon={List} label="Mod Library" collapsed={isCollapsed} />
          <SidebarLink to="/settings" icon={Settings} label="Settings" collapsed={isCollapsed} />
        </nav>

        <div className={cn("border-t border-border/60 text-[9px] font-bold uppercase tracking-tight text-muted-foreground/60 flex flex-col gap-3 shrink-0 overflow-hidden", isCollapsed ? "p-3 items-center" : "p-5")}>
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
