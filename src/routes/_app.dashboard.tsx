import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { StatCard } from "@/components/stat-card";
import { Users, PhoneCall, CalendarClock, Target, TrendingUp, CheckCircle2 } from "lucide-react";
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
  const { role, user, fullName } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", role, user?.uid],
    enabled: !!user,
    queryFn: async () => {
      const today = startOfDayDate();
      const week = startOfWeekDate();
      const uid = user!.uid;

      // ── Calls today ──────────────────────────────────────────────
      let callsTodayQ;
      if (role !== "admin") {
        callsTodayQ = query(
          collection(db, "calls"),
          where("telecallerId", "==", uid),
          where("createdAt", ">=", today),
        );
      } else {
        callsTodayQ = query(collection(db, "calls"), where("createdAt", ">=", today));
      }

      // ── Calls last 7 days ─────────────────────────────────────────
      const callsWeekQ = query(collection(db, "calls"), where("createdAt", ">=", week));

      // ── All leads ─────────────────────────────────────────────────
      const leadsQ = query(collection(db, "leads"), orderBy("createdAt", "desc"));

      // ── All followups ─────────────────────────────────────────────
      let followQ;
      if (role !== "admin") {
        followQ = query(collection(db, "followups"), where("telecallerId", "==", uid));
      } else {
        followQ = query(collection(db, "followups"));
      }

      const [callsTodaySnap, callsWeekSnap, leadsSnap, followSnap] = await Promise.all([
        getDocs(callsTodayQ),
        getDocs(callsWeekQ),
        getDocs(leadsQ),
        getDocs(followQ),
      ]);

      const callsToday = callsTodaySnap.size;
      const callsWeek = callsWeekSnap.docs.map((d) => d.data());
      const leads = leadsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
      const follows = followSnap.docs.map((d) => d.data());

      // ── Telecaller count (admin only) ─────────────────────────────
      let telecallers = 0;
      if (role === "admin") {
        const tcSnap = await getDocs(
          query(collection(db, "users"), where("role", "==", "telecaller")),
        );
        telecallers = tcSnap.size;
      }

      const totalLeads = leads.length;
      const converted = leads.filter((l: any) => l.leadStatus === "Converted").length;
      const conversionRate = totalLeads ? Math.round((converted / totalLeads) * 100) : 0;
      const pendingFollowups = follows.filter((f: any) => f.status === "Pending").length;

      // ── Per-day call buckets (last 7 days) ────────────────────────
      const dayBuckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        dayBuckets[d.toISOString().slice(0, 10)] = 0;
      }
      callsWeek.forEach((c: any) => {
        const ts = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
        const k = ts.toISOString().slice(0, 10);
        if (k in dayBuckets) dayBuckets[k]++;
      });
      const callsChart = Object.entries(dayBuckets).map(([d, v]) => ({
        day: new Date(d).toLocaleDateString(undefined, { weekday: "short" }),
        calls: v,
      }));

      // ── Lead status distribution ───────────────────────────────────
      const statusBuckets: Record<string, number> = {};
      leads.forEach((l: any) => {
        statusBuckets[l.leadStatus] = (statusBuckets[l.leadStatus] ?? 0) + 1;
      });
      const statusChart = Object.entries(statusBuckets).map(([name, value]) => ({ name, value }));

      // ── Recent leads (first 6 from sorted array) ──────────────────
      const recentLeads = leads.slice(0, 6).map((l: any) => ({
        id: l.id,
        customerName: l.customerName,
        mobileNumber: l.mobileNumber,
        leadStatus: l.leadStatus,
      }));

      const myAssigned =
        role !== "admin" ? leads.filter((l: any) => l.assignedTo === uid).length : 0;
      const interested = leads.filter((l: any) => l.leadStatus === "Interested").length;

      return {
        callsToday,
        totalLeads,
        conversionRate,
        pendingFollowups,
        telecallers,
        callsChart,
        statusChart,
        recentLeads,
        myAssigned,
        interested,
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {role === "admin" ? (
          <StatCard
            title="Telecallers"
            value={data?.telecallers ?? "—"}
            icon={<Users className="h-5 w-5" />}
            accent="primary"
          />
        ) : (
          <StatCard
            title="My Assigned Leads"
            value={data?.myAssigned ?? "—"}
            icon={<Users className="h-5 w-5" />}
            accent="primary"
          />
        )}
        <StatCard
          title="Calls Today"
          value={data?.callsToday ?? "—"}
          icon={<PhoneCall className="h-5 w-5" />}
          accent="secondary"
        />
        <StatCard
          title="Total Leads"
          value={data?.totalLeads ?? "—"}
          icon={<Target className="h-5 w-5" />}
          accent="accent"
        />
        <StatCard
          title="Conversion Rate"
          value={`${data?.conversionRate ?? 0}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Calls — last 7 days</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.callsChart ?? []}>
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
                  data={data?.statusChart ?? []}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {(data?.statusChart ?? []).map((_, i) => (
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
            {!isLoading && (data?.recentLeads.length ?? 0) === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No leads yet.</div>
            )}
            {data?.recentLeads.map((l: any) => (
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
              value={data?.pendingFollowups ?? 0}
              icon={<CalendarClock className="h-4 w-4" />}
            />
            <Mini
              label="Interested leads"
              value={data?.interested ?? 0}
              icon={<Target className="h-4 w-4" />}
            />
            <Mini
              label="Calls today"
              value={data?.callsToday ?? 0}
              icon={<PhoneCall className="h-4 w-4" />}
            />
            <Mini
              label="Conversion"
              value={`${data?.conversionRate ?? 0}%`}
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
