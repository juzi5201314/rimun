import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";
import { cn } from "@/shared/lib/utils";
import { ChevronLeft, ChevronRight, List, Settings, Shield, Terminal } from "lucide-react";
import { useState } from "react";
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
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-sans">
      {/* Sidebar */}
      <aside 
        className={cn(
          "border-r border-border bg-card flex flex-col shrink-0 transition-all duration-300 relative group",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        <div className={cn("border-b border-border overflow-hidden", isCollapsed ? "p-4" : "p-8")}>
          <h1 className={cn("font-bold tracking-tighter transition-all", isCollapsed ? "text-xl text-center" : "text-3xl")}>
            {isCollapsed ? "r" : "rimun"}
          </h1>
          {!isCollapsed && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 flex flex-col">
          <SidebarLink to="/" icon={List} label="Mod Library" collapsed={isCollapsed} />
          <SidebarLink to="/settings" icon={Settings} label="Settings" collapsed={isCollapsed} />
        </nav>

        <div className={cn("border-t border-border text-[10px] text-muted-foreground flex flex-col gap-2 overflow-hidden", isCollapsed ? "p-4 items-center" : "p-6")}>
          <div className="flex items-center gap-2" title="Dev Console">
            <Terminal className="w-3 h-3 shrink-0" />
            {!isCollapsed && <span>Dev Console</span>}
          </div>
          <div className="flex items-center gap-2" title="Integrity Verified">
            <Shield className="w-3 h-3 text-primary/60 shrink-0" />
            {!isCollapsed && <span>Integrity Verified</span>}
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
