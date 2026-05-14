import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, query, orderBy, getDocs, updateDoc, doc, where } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { CalendarClock, Check, Clock, AlertCircle, Phone, MessageCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/followups")({
  component: FollowupsPage,
});

type Followup = {
  id: string;
  leadId: string | null;
  followupDate: string;
  notes: string | null;
  status: string;
  // denormalized from lead doc
  customerName?: string;
  mobileNumber?: string;
};

function FollowupsPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"today" | "upcoming" | "overdue" | "completed">("today");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["followups", role, user?.uid],
    enabled: !!user && !!role,
    queryFn: async () => {
      // Build base query — telecallers only see their own, admins see all
      let q;
      if (role !== "admin" && user) {
        q = query(
          collection(db, "followups"),
          where("telecallerId", "==", user.uid),
        );
      } else {
        q = query(collection(db, "followups"));
      }

      const snapshot = await getDocs(q);
      const followups = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          leadId: data.leadId ?? null,
          followupDate: data.followupDate?.toDate
            ? data.followupDate.toDate().toISOString()
            : String(data.followupDate ?? ""),
          notes: data.notes ?? null,
          status: data.status ?? "Pending",
          // denormalized fields stored at write time
          customerName: data.customerName ?? null,
          mobileNumber: data.mobileNumber ?? null,
        } as Followup;
      });

      // Sort by followupDate in ascending order (client-side)
      followups.sort((a, b) => new Date(a.followupDate).getTime() - new Date(b.followupDate).getTime());

      // If any followup is missing customer info, batch-fetch the lead docs
      const missing = followups.filter((f) => !f.customerName && f.leadId);
      if (missing.length > 0) {
        const leadIds = [...new Set(missing.map((f) => f.leadId!))];
        const leadDocs = await Promise.all(
          leadIds.map((id) => getDocs(query(collection(db, "leads"), where("__name__", "==", id)))),
        );
        const leadMap: Record<string, { customerName: string; mobileNumber: string }> = {};
        leadDocs.forEach((snap) => {
          snap.docs.forEach((d) => {
            const ld = d.data();
            leadMap[d.id] = {
              customerName: ld.customerName ?? "Lead",
              mobileNumber: ld.mobileNumber ?? "",
            };
          });
        });
        return followups.map((f) =>
          f.leadId && leadMap[f.leadId] ? { ...f, ...leadMap[f.leadId] } : f,
        );
      }

      return followups;
    },
  });

  const now = new Date();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);

  const buckets = {
    today: items.filter(
      (f) =>
        f.status === "Pending" &&
        new Date(f.followupDate) >= startToday &&
        new Date(f.followupDate) <= endToday,
    ),
    upcoming: items.filter((f) => f.status === "Pending" && new Date(f.followupDate) > endToday),
    overdue: items.filter((f) => f.status === "Pending" && new Date(f.followupDate) < startToday),
    completed: items.filter((f) => f.status === "Completed"),
  };

  const complete = useMutation({
    mutationFn: async (id: string) => {
      await updateDoc(doc(db, "followups", id), { status: "Completed" });
    },
    onSuccess: () => {
      toast.success("Marked complete");
      qc.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const tabs: { key: typeof tab; label: string; icon: any; count: number; tone: string }[] = [
    {
      key: "today",
      label: "Today",
      icon: CalendarClock,
      count: buckets.today.length,
      tone: "text-secondary",
    },
    {
      key: "upcoming",
      label: "Upcoming",
      icon: Clock,
      count: buckets.upcoming.length,
      tone: "text-accent-foreground",
    },
    {
      key: "overdue",
      label: "Overdue",
      icon: AlertCircle,
      count: buckets.overdue.length,
      tone: "text-destructive",
    },
    {
      key: "completed",
      label: "Completed",
      icon: Check,
      count: buckets.completed.length,
      tone: "text-success",
    },
  ];

  const list = buckets[tab];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Follow-Ups</h2>
        <p className="text-sm text-muted-foreground">Stay on top of every commitment.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-xl border bg-card p-4 text-left shadow-card transition-all",
                active ? "ring-2 ring-secondary shadow-soft" : "hover:shadow-soft",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t.label}
                </div>
                <Icon className={cn("h-4 w-4", t.tone)} />
              </div>
              <div className="mt-2 text-2xl font-semibold">{t.count}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border bg-card shadow-card divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && list.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nothing here. Enjoy a quiet moment ✨
          </div>
        )}
        {list.map((f) => (
          <div key={f.id} className="flex items-center justify-between p-4 gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{f.customerName ?? "Lead"}</div>
              <div className="text-xs text-muted-foreground">
                {f.mobileNumber ?? ""} · {new Date(f.followupDate).toLocaleString()}
              </div>
              {f.notes && (
                <div className="text-xs text-muted-foreground mt-1 truncate">"{f.notes}"</div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {f.mobileNumber && (
                <>
                  <a
                    href={`tel:${f.mobileNumber}`}
                    onClick={(e) => e.stopPropagation()}
                    title="Call"
                  >
                    <Button size="icon" variant="ghost">
                      <Phone className="h-4 w-4" />
                    </Button>
                  </a>
                  <a
                    href={`https://wa.me/${f.mobileNumber.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="WhatsApp"
                  >
                    <Button size="icon" variant="ghost">
                      <MessageCircle className="h-4 w-4 text-success" />
                    </Button>
                  </a>
                </>
              )}
              {f.leadId && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate({
                      to: "/lead/$leadId/call",
                      params: { leadId: f.leadId! },
                    });
                  }}
                  title="Log Call / Reschedule"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {f.status === "Pending" && (
                <Button
                  size="sm"
                  className="bg-success text-success-foreground hover:opacity-95 h-8 px-3 ml-2 font-medium"
                  onClick={() => complete.mutate(f.id)}
                  disabled={complete.isPending}
                >
                  Mark done
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
