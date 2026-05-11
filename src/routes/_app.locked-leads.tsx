import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { forceUnlock, formatRemainingLockTime } from "@/lib/lead-lock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Unlock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/locked-leads")({
  component: LockedLeadsPanel,
});

interface LockedLead {
  id: string;
  customerName: string;
  mobileNumber: string;
  lockedBy?: string;
  lockedByName?: string;
  lockedAt?: Date;
  lockExpiresAt?: Date;
  city?: string;
  priority?: string;
}

function LockedLeadsPanel() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  // Only admins can access
  if (role !== "admin") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>You do not have permission to access this page.</AlertDescription>
      </Alert>
    );
  }

  // Fetch locked leads
  const { data: lockedLeads = [], isLoading } = useQuery({
    queryKey: ["locked-leads"],
    enabled: !!user,
    queryFn: async () => {
      const q = query(collection(db, "leads"), where("isLocked", "==", true));
      const snap = await getDocs(q);

      return snap.docs
        .map((d) => ({
          id: d.id,
          customerName: d.data().customerName,
          mobileNumber: d.data().mobileNumber,
          lockedBy: d.data().lockedBy,
          lockedByName: d.data().lockedByName,
          lockedAt: d.data().lockedAt?.toDate?.() || undefined,
          lockExpiresAt: d.data().lockExpiresAt?.toDate?.() || undefined,
          city: d.data().city,
          priority: d.data().priority,
        }))
        .sort(
          (a, b) =>
            (b.lockedAt?.getTime() || 0) - (a.lockedAt?.getTime() || 0),
        ) as LockedLead[];
    },
  });

  // Force unlock mutation
  const unlockMutation = useMutation({
    mutationFn: async (leadId: string) => {
      await forceUnlock(leadId);
    },
    onSuccess: () => {
      toast.success("Lead unlocked successfully");
      qc.invalidateQueries({ queryKey: ["locked-leads"] });
    },
    onError: (error: any) => {
      toast.error(`Failed to unlock: ${error.message}`);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Locked Leads</h1>
        <p className="text-muted-foreground">
          View and manage leads currently locked by telecallers
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Lead Locks</CardTitle>
          <CardDescription>
            {lockedLeads.length} lead{lockedLeads.length !== 1 ? "s" : ""} currently locked
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : lockedLeads.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No leads are currently locked</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Locked By</TableHead>
                    <TableHead>Locked At</TableHead>
                    <TableHead>Expires In</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lockedLeads.map((lead) => {
                    const isExpired =
                      lead.lockExpiresAt && new Date() > lead.lockExpiresAt;
                    return (
                      <TableRow key={lead.id} className={isExpired ? "opacity-50" : ""}>
                        <TableCell className="font-medium">
                          {lead.customerName}
                        </TableCell>
                        <TableCell>{lead.mobileNumber}</TableCell>
                        <TableCell>
                          <span className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            {lead.lockedByName || "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lead.lockedAt?.toLocaleTimeString()}
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {isExpired ? (
                            <span className="text-red-600">Expired</span>
                          ) : (
                            <span className="text-green-600">
                              {formatRemainingLockTime(lead.lockExpiresAt)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{lead.city || "—"}</TableCell>
                        <TableCell>
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded ${
                              lead.priority === "High"
                                ? "bg-red-100 text-red-700"
                                : lead.priority === "Low"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {lead.priority || "Medium"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => unlockMutation.mutate(lead.id)}
                            disabled={unlockMutation.isPending}
                          >
                            {unlockMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Unlock className="h-4 w-4" />
                                Unlock
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lock Status Legend</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <span>Available - No lock active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-yellow-500" />
            <span>Locked by you - Your active call session</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span>Locked by another user - Cannot be accessed</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
