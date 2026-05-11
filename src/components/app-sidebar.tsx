import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  PhoneCall,
  CalendarClock,
  BarChart3,
  UserCog,
  Settings,
  LogOut,
  Headphones,
  FileUp,
  Send,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const baseNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/followups", label: "Follow-Ups", icon: CalendarClock },
  { to: "/reports", label: "Reports", icon: BarChart3 },
] as const;

const telecallerNav = [
  { to: "/my-leads", label: "My Leads", icon: Headphones },
] as const;

const adminNav = [
  { to: "/leads", label: "All Leads", icon: Users },
  { to: "/import-leads", label: "Import Leads", icon: FileUp },
  { to: "/lead-assignment", label: "Lead Assignment", icon: Send },
  { to: "/locked-leads", label: "Locked Leads", icon: Lock },
  { to: "/users", label: "Users", icon: UserCog },
] as const;

const tail = [{ to: "/settings", label: "Settings", icon: Settings }] as const;

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { role, signOut, fullName, user } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });

  // Build navigation based on role
  const roleSpecificNav = role === "admin" ? adminNav : telecallerNav;
  const items = [...baseNav, ...roleSpecificNav, ...tail];

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-accent">
          <Headphones className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-base font-semibold tracking-tight">TeleFlow</div>
          <div className="text-[11px] text-sidebar-foreground/60 uppercase tracking-wider">CRM</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((item) => {
          const active = 
            path === item.to || 
            (item.to !== "/app/dashboard" && path.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-accent text-white text-sm font-semibold">
            {(fullName || user?.email || "U").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{fullName || user?.email}</div>
            <div className="text-[11px] text-sidebar-foreground/60 capitalize">{role}</div>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-2 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4 mr-2" /> Logout
        </Button>
      </div>
    </aside>
  );
}
