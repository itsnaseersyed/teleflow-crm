import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { PhoneCall, Target, TrendingUp, CalendarClock } from "lucide-react";
import { StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, role } = useAuth();
  const fullName = profile?.fullName || user?.displayName;

  const { data } = useQuery({
    queryKey: ["my-stats", user?.uid],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const uid = user.uid;

      const [callsSnap, leadsSnap, followsSnap] = await Promise.all([
        getDocs(query(collection(db, "calls"), where("telecallerId", "==", uid))),
        getDocs(query(collection(db, "leads"), where("assignedTo", "==", uid))),
        getDocs(query(collection(db, "followups"), where("telecallerId", "==", uid))),
      ]);

      const totalCalls = callsSnap.size;
      const leads = leadsSnap.docs.map((d) => d.data());
      const totalLeads = leads.length;
      const converted = leads.filter((l) => l.leadStatus === "Converted").length;
      const follows = followsSnap.docs.map((d) => d.data());
      const pending = follows.filter((f) => f.status === "Pending").length;

      return {
        totalCalls,
        totalLeads,
        converted,
        pending,
        rate: totalLeads ? Math.round((converted / totalLeads) * 100) : 0,
      };
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-xl border bg-card shadow-card p-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-accent text-white text-2xl font-semibold shadow-soft">
          {(fullName || user?.email || "U").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{fullName || user?.email}</h2>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full border bg-secondary/10 text-secondary border-secondary/30 capitalize">
            {role}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Calls"
          value={data?.totalCalls ?? "—"}
          icon={<PhoneCall className="h-5 w-5" />}
          accent="secondary"
        />
        <StatCard
          title="Assigned Leads"
          value={data?.totalLeads ?? "—"}
          icon={<Target className="h-5 w-5" />}
          accent="accent"
        />
        <StatCard
          title="Converted"
          value={data?.converted ?? "—"}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="success"
        />
        <StatCard
          title="Pending Follow-ups"
          value={data?.pending ?? "—"}
          icon={<CalendarClock className="h-5 w-5" />}
          accent="warning"
        />
      </div>

      <div className="rounded-xl border bg-card shadow-card p-6">
        <h3 className="font-semibold">Performance summary</h3>
        <p className="text-sm text-muted-foreground mt-1">Conversion rate</p>
        <div className="mt-3 h-3 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-accent transition-all duration-700"
            style={{ width: `${data?.rate ?? 0}%` }}
          />
        </div>
        <div className="mt-2 text-sm font-medium">{data?.rate ?? 0}%</div>
      </div>
    </div>
  );
}
