import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useFollowups, useFollowupMutations } from "@/hooks/useFollowups";
import { CalendarClock, Check, Phone, MessageCircle, Pencil, User, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useVirtualizer } from "@tanstack/react-virtual";

export const Route = createFileRoute("/_app/followups")({
  component: FollowupsPage,
});

type Followup = {
  id: string;
  leadId: string | null;
  followupDate: string;
  notes: string | null;
  status: string;
  telecallerId?: string;
  customerName?: string;
  mobileNumber?: string;
};

function FollowupsPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("Pending");
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    refetch
  } = useFollowups(role === "admin" ? undefined : user?.uid, status);

  // Fetch users for name mapping
  const { data: users = [] } = useQuery({
    queryKey: ["users-list-followup"],
    queryFn: async () => {
      const q = query(collection(db, "users"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        fullName: doc.data().fullName || doc.data().email || "User",
      }));
    },
    enabled: role === "admin",
  });

  const usersMap = new Map(users.map((u) => [u.id, u.fullName]));
  const { complete } = useFollowupMutations();
  
  const allFollowups = useMemo(() => {
    const fetched = data?.pages.flatMap((page: any) => page.items) ?? [];
    // Strict uniqueness filter to prevent React Key errors
    const uniqueMap = new Map();
    fetched.forEach(item => {
      if (item && item.id) uniqueMap.set(item.id, item);
    });
    return Array.from(uniqueMap.values());
  }, [data]);

  // Virtualizer setup
  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? allFollowups.length + 1 : allFollowups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 75,
    overscan: 10,
  });

  // Infinite scroll trigger
  useEffect(() => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    if (virtualItems.length === 0) return;
    
    const lastItem = virtualItems[virtualItems.length - 1];
    if (
      lastItem.index >= allFollowups.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, allFollowups.length, rowVirtualizer.getVirtualItems(), fetchNextPage]);

  const tabs = [
    { key: "Pending", label: "Pending", icon: CalendarClock, tone: "text-secondary" },
    { key: "Completed", label: "Completed", icon: Check, tone: "text-success" },
  ];

  return (
    <div className="space-y-5 h-full flex flex-col">
      <div className="flex justify-between items-start shrink-0">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Follow-Ups</h2>
          <p className="text-sm text-muted-foreground">Stay on top of every commitment.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => {
          qc.invalidateQueries({ queryKey: ["followups"] });
          refetch();
        }}>
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = status === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
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
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm shrink-0">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Error Loading Follow-ups
          </div>
          <p className="text-xs opacity-90 mt-1">{error.message}</p>
        </div>
      )}

      <div 
        ref={parentRef}
        className="flex-1 overflow-auto rounded-xl border bg-card shadow-card relative"
      >
        {isLoading && <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading follow-ups...
        </div>}

        {!isLoading && allFollowups.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
            <div className="text-2xl">✨</div>
            <p>No {status.toLowerCase()} follow-ups found.</p>
          </div>
        )}

        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const isLoaderRow = virtualRow.index > allFollowups.length - 1;
            const f = allFollowups[virtualRow.index];

            if (isLoaderRow) {
              return (
                <div
                  key="loader"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center justify-center p-4"
                >
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              );
            }

            const assignedName = usersMap.get(f.telecallerId || "") || "User";

            return (
              <div
                key={f.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex items-center justify-between p-3 gap-2 sm:gap-3 border-b last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{f.customerName ?? "Customer"}</div>
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Phone className="h-3 w-3" />
                      {f.mobileNumber ?? "No number"}
                      <span className="mx-1 opacity-30">|</span>
                      <CalendarClock className="h-3 w-3" />
                      {typeof f.followupDate === 'string' ? f.followupDate : new Date(f.followupDate).toLocaleDateString()}
                    </div>
                    {role === "admin" && (
                      <div className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold mt-1">
                        <User className="h-2.5 w-2.5" />
                        Assigned: {assignedName}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {f.mobileNumber && (
                    <a href={`tel:${f.mobileNumber}`} title="Call">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600 hover:bg-blue-50">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                  {f.leadId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-orange-600 hover:bg-orange-50"
                      onClick={() => navigate({ to: "/lead/$leadId/call", params: { leadId: f.leadId! }, search: { from: "followups", status: undefined }})}
                      title="Log Call"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {status === "Pending" && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700 h-8 px-3 ml-2 text-xs font-medium"
                      onClick={() => complete.mutate({ id: f.id, leadId: f.leadId, userId: user?.uid! })}
                      disabled={complete.isPending}
                    >
                      Done
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return <RefreshCw className={cn("h-4 w-4 animate-spin", className)} />;
}
