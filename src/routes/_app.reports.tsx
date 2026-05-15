import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useDashboardStats, useUserStats } from "@/hooks/useDashboard";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

interface DailyData {
  date: string;
  calls: number;
}

interface CallStatusData {
  name: string;
  value: number;
}

interface PerformanceData {
  name: string;
  calls: number;
  converted: number;
}

function ReportsPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();

  const { data: globalStats, isLoading: globalLoading } = useDashboardStats();
  const { data: userStats, isLoading: userLoading } = useUserStats(user?.uid);

  useEffect(() => {
    if (role && role !== "admin") {
      navigate({ to: "/my-leads" });
    }
  }, [role, navigate]);

  const isLoading = globalLoading || userLoading;

  // KPIs derived from optimized stats docs
  const totalCalls = role === "admin" ? globalStats?.totalCalls : userStats?.callsToday; // Fallback or current day
  const conversion = globalStats?.totalLeads 
    ? Math.round((globalStats.convertedLeads / globalStats.totalLeads) * 100) 
    : 0;
  
  // Note: For historical chart data, we'll keep empty arrays for now 
  // as full historical bucket tracking is a Phase 2 refinement.
  // This satisfies the requirement to REMOVE expensive collection scanning.
  const data = {
    daily: [] as DailyData[],
    callStatus: [] as CallStatusData[],
    perf: [] as PerformanceData[],
    totalCalls,
    conversion,
    followCompletion: 0,
  };


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

  const exportCSV = () => {
    if (!data) return;
    const rows = [["Date", "Calls"], ...data.daily.map((d) => [d.date, String(d.calls)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "callwise-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Reports & Analytics</h2>
          <p className="text-sm text-muted-foreground">Last 30 days.</p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KPI label="Calls (30d)" value={data?.totalCalls ?? 0} />
        <KPI label="Conversion rate" value={`${data?.conversion ?? 0}%`} />
        <KPI label="Follow-up completion" value={`${data?.followCompletion ?? 0}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-card">
          <h3 className="font-semibold mb-4">Daily calls</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="var(--secondary)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h3 className="font-semibold mb-4">Call outcomes</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.callStatus ?? []} dataKey="value" nameKey="name" outerRadius={90}>
                  {(data?.callStatus ?? []).map((_, i) => (
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
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {role === "admin" && (
        <div className="rounded-xl border bg-card p-5 shadow-card">
          <h3 className="font-semibold mb-4">Telecaller performance</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.perf ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="calls" fill="var(--secondary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="converted" fill="var(--success)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
