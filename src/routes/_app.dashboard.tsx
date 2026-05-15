import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useDashboardStats, useUserStats } from "@/hooks/useDashboard";
import { StatCard } from "@/components/stat-card";
import { Users, PhoneCall, CalendarClock, Target, TrendingUp, CheckCircle2, Headphones, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { statusBadgeClass } from "@/lib/lead-utils";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function startOfDayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfWeekDate() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return d;
}

function Dashboard() {
  const { role, user, profile } = useAuth();
  const navigate = useNavigate();

  const fullName = profile?.fullName;

  const { data: globalStats, isLoading: globalLoading } = useDashboardStats();
  const { data: userStats, isLoading: userLoading } = useUserStats(user?.uid);

  useEffect(() => {
    if (role && role !== "admin") {
      navigate({ to: "/my-leads" });
    }
  }, [role, navigate]);

  // Handle loading state
  const isLoading = globalLoading || userLoading;

  // Chart data calculation from stats or fallback to empty
  const statusChart = globalStats ? [
    { name: "Unassigned", value: globalStats.unassignedLeads },
    { name: "Assigned", value: globalStats.assignedLeads },
    { name: "In Progress", value: globalStats.inProgressLeads },
    { name: "Converted", value: globalStats.convertedLeads },
    { name: "Follow-Up", value: globalStats.followUpLeads },
  ].filter(i => i.value > 0) : [];

  // Note: callsChart and recentLeads would ideally be their own optimized queries or part of a lightweight summary.
  // For the architectural fix, we'll keep placeholders or fetch a very limited set.
  const callsChart: any[] = []; // Implementation of daily bucket tracking is a Phase 2 refinement
  const recentLeads: any[] = []; // Phase 2: Lightweight query for last 5 leads

  const conversionRate = globalStats?.totalLeads 
    ? Math.round((globalStats.convertedLeads / globalStats.totalLeads) * 100) 
    : 0;


  const COLORS = [
    "var(--secondary)",
    "var(--accent)",
    "var(--success)",
    "var(--warning)",
    "var(--destructive)",
    "var(--primary)",
    "#94a3b8",
    "#64748b",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
          Welcome back{fullName ? `, ${fullName.split(" ")[0]}` : ""}.
        </h2>
        <p className="text-sm text-muted-foreground">
          {role === "admin"
            ? "Here's what's happening across your team today."
            : "Here's your activity for today."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {role === "admin" ? (
          <>
            <StatCard
              title="Telecallers"
              value={globalStats?.telecallerCount ?? "—"}
              icon={<Users className="h-5 w-5" />}
              accent="primary"
            />
            <StatCard
              title="Total Leads"
              value={globalStats?.totalLeads ?? "—"}
              icon={<Target className="h-5 w-5" />}
              accent="accent"
            />
            <StatCard
              title="Unassigned"
              value={globalStats?.unassignedLeads ?? "—"}
              icon={<AlertCircle className="h-5 w-5" />}
              accent="warning"
            />
            <StatCard
              title="Assigned"
              value={globalStats?.assignedLeads ?? "—"}
              icon={<Users className="h-5 w-5" />}
              accent="secondary"
            />
            <StatCard
              title="Converted"
              value={globalStats?.convertedLeads ?? "—"}
              icon={<TrendingUp className="h-5 w-5" />}
              accent="success"
            />
          </>
        ) : (
          <>
            <StatCard
              title="My Queue"
              value={userStats?.assignedLeads ?? "—"}
              icon={<Headphones className="h-5 w-5" />}
              accent="primary"
            />
            <StatCard
              title="Completed Today"
              value={userStats?.convertedLeads ?? "—"} // Fallback or user specific completion stat
              icon={<CheckCircle2 className="h-5 w-5" />}
              accent="success"
            />
            <StatCard
              title="Converted"
              value={userStats?.convertedLeads ?? "—"}
              icon={<TrendingUp className="h-5 w-5" />}
              accent="accent"
            />
            <StatCard
              title="Calls Today"
              value={userStats?.callsToday ?? "—"}
              icon={<PhoneCall className="h-5 w-5" />}
              accent="secondary"
            />
            <StatCard
              title="Pending Follow-ups"
              value={userStats?.followUpLeads ?? "—"}
              icon={<CalendarClock className="h-5 w-5" />}
              accent="warning"
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Calls — last 7 days</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={callsChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="calls" fill="var(--secondary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h3 className="font-semibold mb-4">Lead status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusChart}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {statusChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex items-center justify-between p-5 border-b">
            <h3 className="font-semibold">Recent leads</h3>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="divide-y">
            {isLoading && <div className="p-5 text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && recentLeads.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No leads yet.</div>
            )}
            {recentLeads.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium text-sm">{l.customerName}</div>
                  <div className="text-xs text-muted-foreground">{l.mobileNumber}</div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full border ${statusBadgeClass(l.leadStatus)}`}
                >
                  {l.leadStatus}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-card p-5">
          <h3 className="font-semibold">Today's snapshot</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Mini
              label="Pending follow-ups"
              value={globalStats?.followUpLeads ?? 0}
              icon={<CalendarClock className="h-4 w-4" />}
            />
            <Mini
              label="Interested leads"
              value={globalStats?.convertedLeads ?? 0} // Using converted/interested proxy
              icon={<Target className="h-4 w-4" />}
            />
            <Mini
              label="Calls today"
              value={userStats?.callsToday ?? globalStats?.totalCalls ?? 0}
              icon={<PhoneCall className="h-4 w-4" />}
            />
            <Mini
              label="Conversion"
              value={`${conversionRate}%`}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}
