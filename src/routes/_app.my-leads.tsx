import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Phone,
  ChevronRight,
  Clock,
  CheckCircle2,
  Loader2,
  MapPin,
  Target,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLockRealtime } from "@/lib/lock-realtime";

export const Route = createFileRoute("/_app/my-leads")({
  component: MyLeadsPage,
});

interface Lead {
  id: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  interestedService?: string;
  priority?: string;
  leadStatus: "Assigned" | "In Progress" | "Completed";
  assignedTo: string;
  lastCallStatus?: string;
  lastCalledAt?: Date;
  createdAt: Date;
  isLocked?: boolean;
  lockedBy?: string;
  lockedByName?: string;
  lockExpiresAt?: Date;
  // Escalation fields
  sourcedBy?: string; // Junior who sourced the lead
  handledBy?: string; // Senior who closed it
  escalationStatus?: "none" | "pending_senior" | "closed_by_senior"; // Escalation status
  escalatedAt?: Date; // When escalated
  escalationNotes?: string; // Notes from junior
}

// Lock Status Badge Component
function LockStatusBadge({ leadId, currentUserId }: { leadId: string; currentUserId: string }) {
  const { lockStatus } = useLockRealtime(leadId, currentUserId);

  if (!lockStatus.isLocked) {
    // Green: Available
    return (
      <div className="h-2 w-2 rounded-full bg-green-500" title="Available" />
    );
  }

  if (lockStatus.isLockedByCurrentUser) {
    // Yellow: Locked by you
    return (
      <div
        className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"
        title="Locked by you"
      />
    );
  }

  // Red: Locked by another user
  return (
    <div
      className="h-2 w-2 rounded-full bg-red-500"
      title={`Locked by ${lockStatus.lockedByName}`}
    />
  );
}

function MyLeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("Assigned");

  // All leads assigned to this user (one Firestore query; tab filter is client-side)
  const {
    data: assignedLeads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["my-leads", user?.uid],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));

      const snap = await getDocs(q);
      const leadsList = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
        lastCalledAt: d.data().lastCalledAt?.toDate?.() || undefined,
      })) as Lead[];

      return leadsList.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  });

  const leads = useMemo(() => {
    return assignedLeads
      .filter((lead) => lead.leadStatus === filterStatus)
      .filter((lead) => lead.escalationStatus !== "pending_senior")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [assignedLeads, filterStatus]);

  // Fetch converted leads sourced by current user (closed by senior)
  const { data: convertedLeads = [], isLoading: convertedLoading } = useQuery({
    queryKey: ["my-converted-leads", user?.uid],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const q = query(collection(db, "leads"), where("sourcedBy", "==", user.uid));

      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as any),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
          lastCalledAt: d.data().lastCalledAt?.toDate?.() || undefined,
        }))
        .filter(
          (l) =>
            l.escalationStatus === "closed_by_senior" && l.leadStatus === "Completed"
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) as Lead[];
    },
  });

  // Filter leads by search
  const filteredLeads = leads.filter((lead) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      lead.customerName.toLowerCase().includes(q) ||
      lead.mobileNumber.includes(q) ||
      (lead.city || "").toLowerCase().includes(q)
    );
  });

  const notPendingEscalation = (l: Lead) => l.escalationStatus !== "pending_senior";

  // Calculate statistics (across all assigned leads, excluding pending escalation queue)
  const stats = {
    total: assignedLeads.filter(notPendingEscalation).length,
    pending: assignedLeads.filter((l) => notPendingEscalation(l) && l.leadStatus === "Assigned").length,
    inProgress: assignedLeads.filter((l) => notPendingEscalation(l) && l.leadStatus === "In Progress").length,
    completed: assignedLeads.filter((l) => notPendingEscalation(l) && l.leadStatus === "Completed").length,
    converted: convertedLeads.length,
  };

  const handleStartCall = (leadId: string) => {
    navigate({
      to: "/lead/$leadId/call",
      params: { leadId },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Leads</h2>
        <p className="text-muted-foreground mt-1">
          Your assigned leads queue. Click on a lead to start calling.
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase">Total</p>
              <p className="text-3xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-blue-600 mb-1 uppercase font-semibold">Pending</p>
              <p className="text-3xl font-bold text-blue-700">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-amber-600 mb-1 uppercase font-semibold">In Progress</p>
              <p className="text-3xl font-bold text-amber-700">{stats.inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-green-600 mb-1 uppercase font-semibold">Completed</p>
              <p className="text-3xl font-bold text-green-700">{stats.completed}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-purple-600 mb-1 uppercase font-semibold">Converted ⭐</p>
              <p className="text-3xl font-bold text-purple-700">{stats.converted}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Lead Queue</CardTitle>
              <CardDescription>
                {filteredLeads.length} of {leads.length} leads
              </CardDescription>
            </div>
            <div className="flex gap-3 flex-col sm:flex-row">
              <Input
                placeholder="Search by name, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sm:w-64"
              />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Assigned">Pending</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Could not load leads: {(error as Error)?.message || "Unknown error"}. If this persists,
                contact your administrator.
              </AlertDescription>
            </Alert>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? null : filteredLeads.length === 0 ? (
            <div className="text-center py-12">
              {stats.total === 0 ? (
                <>
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold mb-1">No leads assigned yet</p>
                  <p className="text-sm text-muted-foreground">
                    Your admin will assign leads to you. Check back later!
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No leads match your search</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLeads.map((lead, index) => (
                <div
                  key={lead.id}
                  className="rounded-lg border p-4 hover:bg-muted/50 transition cursor-pointer"
                  onClick={() => handleStartCall(lead.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Lead Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded">
                          #{index + 1}
                        </span>
                        <h3 className="font-semibold text-base truncate">
                          {lead.customerName}
                        </h3>
                        {lead.priority && (
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded ${
                              lead.priority === "High"
                                ? "bg-red-100 text-red-700"
                                : lead.priority === "Low"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {lead.priority}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-4 w-4" />
                          <span>{lead.mobileNumber}</span>
                        </div>
                        {lead.city && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            <span>{lead.city}</span>
                          </div>
                        )}
                        {lead.interestedService && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Target className="h-4 w-4" />
                            <span>{lead.interestedService}</span>
                          </div>
                        )}
                        {lead.lastCalledAt && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span className="text-xs">
                              {lead.lastCalledAt.toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {lead.lastCallStatus && (
                        <div className="mt-2">
                          <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                            Last: {lead.lastCallStatus}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status & Action */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-2 mb-2">
                          <p className="text-xs text-muted-foreground">
                            {lead.leadStatus === "Assigned" && "Ready to call"}
                            {lead.leadStatus === "In Progress" && "In Progress"}
                            {lead.leadStatus === "Completed" && "Completed"}
                          </p>
                          {/* Lock Status Badge */}
                          <LockStatusBadge
                            leadId={lead.id}
                            currentUserId={user?.uid || ""}
                          />
                        </div>
                        <Button
                          size="sm"
                          className="bg-gradient-accent text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartCall(lead.id);
                          }}
                        >
                          {lead.leadStatus === "Assigned" && (
                            <>
                              <Phone className="h-4 w-4 mr-1" />
                              Call Now
                            </>
                          )}
                          {lead.leadStatus === "In Progress" && (
                            <>
                              <ChevronRight className="h-4 w-4 mr-1" />
                              Continue
                            </>
                          )}
                          {lead.leadStatus === "Completed" && (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              View
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My Converted Leads Section */}
      {stats.converted > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="text-purple-900">⭐ Leads You Sourced & Got Converted</CardTitle>
            <CardDescription className="text-purple-800">
              These leads were escalated to senior telecallers and successfully converted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {convertedLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : convertedLeads.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>No converted leads yet. Keep sourcing qualified leads!</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {convertedLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="p-4 rounded-lg border border-purple-200 bg-white flex items-center justify-between hover:shadow-md transition-shadow"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <p className="font-semibold text-purple-900">{lead.customerName}</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span>{lead.mobileNumber}</span>
                        </div>
                        {lead.city && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span>{lead.city}</span>
                          </div>
                        )}
                        {lead.interestedService && (
                          <div className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            <span>{lead.interestedService}</span>
                          </div>
                        )}
                        <div className="text-xs text-purple-600 font-semibold">
                          Closed by: {lead.handledBy ? "Senior" : "---"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        ✓ Converted
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
