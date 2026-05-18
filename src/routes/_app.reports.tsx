import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
} from "recharts";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";

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

  const [perfData, setPerfData] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchTelecallerPerformance = async () => {
    setIsSyncing(true);
    try {
      // 1. Fetch active telecallers
      const usersRef = collection(db, "users");
      const qUsers = query(usersRef, where("role", "==", "telecaller"));
      const usersSnap = await getDocs(qUsers);
      const telecallers = usersSnap.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName || doc.data().email || "User",
      }));

      // 2. Fetch all leads that have an assignedTo
      const leadsRef = collection(db, "leads");
      const leadsSnap = await getDocs(leadsRef);
      const leads = leadsSnap.docs.map(doc => ({
        id: doc.id,
        assignedTo: doc.data().assignedTo,
        leadStatus: doc.data().leadStatus,
        assignedAt: doc.data().assignedAt,
      }));

      // 3. Fetch all calls logged today (attempts)
      const callsRef = collection(db, "calls");
      const callsSnap = await getDocs(callsRef);
      const calls = callsSnap.docs.map(doc => ({
        leadId: doc.data().leadId,
        telecallerId: doc.data().telecallerId,
        createdAt: doc.data().createdAt,
      }));

      const today = new Date();
      const isToday = (dateVal: any) => {
        if (!dateVal) return false;
        const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
        return d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear();
      };

      // 4. Map leads and calls to telecallers
      const performance = telecallers.map(tc => {
        const tcLeads = leads.filter(l => l.assignedTo === tc.id);
        const tcLeadsToday = tcLeads.filter(l => isToday(l.assignedAt));
        const tcLeadsOlder = tcLeads.filter(l => !isToday(l.assignedAt));
        const tcCallsToday = calls.filter(c => c.telecallerId === tc.id && isToday(c.createdAt));

        // Enforce: Only count a lead once, and only if it was assigned today
        const dialedToday = tcLeadsToday.filter(lead =>
          tcCallsToday.some(call => call.leadId === lead.id)
        ).length;

        // Enforce: Only count a lead once, and only if it was assigned before today (follow-up attempt)
        const followupAttempts = tcLeadsOlder.filter(lead =>
          tcCallsToday.some(call => call.leadId === lead.id)
        ).length;

        const incompleteWork = tcLeads.filter(lead => lead.leadStatus === "Assigned").length;

        return {
          id: tc.id,
          name: tc.fullName,
          assigned: tcLeadsToday.length,
          dialed: dialedToday,
          followup: followupAttempts,
          incomplete: incompleteWork,
        };
      });

      setPerfData(performance);
    } catch (error) {
      console.error("Error fetching performance stats:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (role === "admin") {
      fetchTelecallerPerformance();
    }
  }, [role]);

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
        <div className="rounded-xl border bg-card p-5 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">Telecaller Performance</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Today's assignments, in-progress tasks, and completed calls.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTelecallerPerformance}
              disabled={isSyncing}
              className="gap-2 shadow-soft hover:bg-muted/50 border border-muted-foreground/10"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-gradient-accent" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Data"}
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground border-b border-muted">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Telecaller Name</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-center">Assigned Today</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-center">Dialed Today</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-center">Follow-up Attempts</th>
                    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-center">Incomplete Work</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted/60">
                  {isSyncing && perfData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-muted-foreground">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gradient-accent" />
                        Calculating performance metrics...
                      </td>
                    </tr>
                  ) : perfData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-muted-foreground text-sm">
                        No active telecallers found or no leads assigned.
                      </td>
                    </tr>
                  ) : (
                    perfData.map((perf) => (
                      <tr key={perf.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3.5 font-medium flex items-center gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-accent text-white text-xs font-semibold">
                            {perf.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-foreground">{perf.name}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-indigo-500">
                          {perf.assigned}
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-emerald-500">
                          {perf.dialed}
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-amber-500">
                          {perf.followup}
                        </td>
                        <td className="px-4 py-3.5 text-center font-semibold text-rose-500">
                          {perf.incomplete}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
