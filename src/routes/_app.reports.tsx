import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
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

function ReportsPage() {
  const { role, user } = useAuth();

  const { data } = useQuery({
    queryKey: ["reports", role, user?.uid],
    enabled: !!user,
    queryFn: async () => {
      const uid = user!.uid;
      const since = new Date();
      since.setDate(since.getDate() - 29);
      since.setHours(0, 0, 0, 0);

      // ── Calls last 30 days ────────────────────────────────────────
      let callsQ;
      if (role !== "admin") {
        callsQ = query(
          collection(db, "calls"),
          where("telecallerId", "==", uid),
          where("createdAt", ">=", since),
        );
      } else {
        callsQ = query(collection(db, "calls"), where("createdAt", ">=", since));
      }

      // ── Leads last 30 days ────────────────────────────────────────
      const leadsQ = query(collection(db, "leads"), where("createdAt", ">=", since));

      // ── All followups ─────────────────────────────────────────────
      let followQ;
      if (role !== "admin") {
        followQ = query(collection(db, "followups"), where("telecallerId", "==", uid));
      } else {
        followQ = query(collection(db, "followups"));
      }

      const [callsSnap, leadsSnap, followSnap] = await Promise.all([
        getDocs(callsQ),
        getDocs(leadsQ),
        getDocs(followQ),
      ]);

      const calls = callsSnap.docs.map((d) => d.data());
      const leads = leadsSnap.docs.map((d) => d.data());
      const follows = followSnap.docs.map((d) => d.data());

      // ── Daily calls last 30 days ──────────────────────────────────
      const days: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        days[d.toISOString().slice(0, 10)] = 0;
      }
      calls.forEach((c: any) => {
        const ts = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt ?? 0);
        const k = ts.toISOString().slice(0, 10);
        if (k in days) days[k]++;
      });
      const daily = Object.entries(days).map(([d, v]) => ({ date: d.slice(5), calls: v }));

      // ── Call status distribution ───────────────────────────────────
      const buckets: Record<string, number> = {};
      calls.forEach((c: any) => {
        buckets[c.callStatus] = (buckets[c.callStatus] ?? 0) + 1;
      });
      const callStatus = Object.entries(buckets).map(([name, value]) => ({ name, value }));

      // ── Telecaller performance (admin only) ───────────────────────
      let perf: { name: string; calls: number; converted: number }[] = [];
      if (role === "admin") {
        const tcSnap = await getDocs(
          query(collection(db, "users"), where("role", "==", "telecaller")),
        );
        perf = tcSnap.docs.map((d) => {
          const tcUid = d.id;
          const tcData = d.data();
          const callCount = calls.filter((c: any) => c.telecallerId === tcUid).length;
          const conv = leads.filter(
            (l: any) => l.assignedTo === tcUid && l.leadStatus === "Converted",
          ).length;
          return {
            name: tcData.fullName || tcData.email || "—",
            calls: callCount,
            converted: conv,
          };
        });
      }

      const totalLeads = leads.length;
      const converted = leads.filter((l: any) => l.leadStatus === "Converted").length;
      const conversion = totalLeads ? Math.round((converted / totalLeads) * 100) : 0;
      const followCompletion = follows.length
        ? Math.round(
            (follows.filter((f: any) => f.status === "Completed").length / follows.length) * 100,
          )
        : 0;

      return {
        daily,
        callStatus,
        perf,
        totalCalls: calls.length,
        conversion,
        followCompletion,
      };
    },
  });

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
