import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  icon,
  hint,
  accent,
}: {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: string;
  accent?: "primary" | "secondary" | "accent" | "success" | "warning" | "destructive";
}) {
  const accentBg: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/10 text-secondary",
    accent: "bg-accent/15 text-accent-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card hover:shadow-soft transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            accentBg[accent ?? "secondary"],
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
