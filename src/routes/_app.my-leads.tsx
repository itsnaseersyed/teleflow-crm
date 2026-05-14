import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueue } from "@/hooks/useQueue";
import { useUserStats } from "@/hooks/useDashboard";
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
  MessageCircle,
  Pencil,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/_app/my-leads")({
  component: MyLeadsPage,
});

interface Lead {
  id: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  leadStatus: "Assigned" | "In Progress" | "Completed" | "Follow-Up" | "Not Interested" | "Converted";
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



function MyLeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("Assigned");

  // Realtime queue for the active work status
  const { leads: assignedLeads, loading: queueLoading } = useQueue(user?.uid, filterStatus);
  const { data: stats, isLoading: statsLoading } = useUserStats(user?.uid);

  // Still need converted leads for the sourced section
  // Refactor: We'll fetch a limited set for the sourcing display
  const { data: convertedLeads = [], isLoading: convertedLoading } = useQuery({
    queryKey: ["my-converted-leads", user?.uid],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const q = query(
        collection(db, "leads"), 
        where("assignedTo", "==", user.uid),
        where("leadStatus", "==", "Converted"),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
    },
  });

  const isLoading = queueLoading || statsLoading;

  // Filter leads by search (client-side for the realtime set)
  const filteredLeads = assignedLeads.filter((lead) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      lead.customerName.toLowerCase().includes(q) ||
      lead.mobileNumber.includes(q) ||
      (lead.city || "").toLowerCase().includes(q)
    );
  });


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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1 uppercase">Total</p>
              <p className="text-3xl font-bold">{stats?.totalLeads ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-blue-600 mb-1 uppercase font-semibold">Pending</p>
              <p className="text-3xl font-bold text-blue-700">{stats?.assignedLeads ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-amber-600 mb-1 uppercase font-semibold">In Progress</p>
              <p className="text-3xl font-bold text-amber-700">{stats?.inProgressLeads ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-orange-600 mb-1 uppercase font-semibold">Follow-Up</p>
              <p className="text-3xl font-bold text-orange-700">{stats?.followUpLeads ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-red-600 mb-1 uppercase font-semibold">Not Interested</p>
              <p className="text-3xl font-bold text-red-700">{stats?.notInterestedLeads ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-green-600 mb-1 uppercase font-semibold">Completed</p>
              <p className="text-3xl font-bold text-green-700">{stats?.completedLeads ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div>
              <p className="text-xs text-purple-600 mb-1 uppercase font-semibold">Converted ⭐</p>
              <p className="text-3xl font-bold text-purple-700">{stats?.convertedLeads ?? 0}</p>
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
                {filteredLeads.length} leads in current status
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
                  <SelectItem value="Follow-Up">Follow-Up</SelectItem>
                  <SelectItem value="Not Interested">Not Interested</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Converted">Converted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold mb-1">No leads found</p>
              <p className="text-sm text-muted-foreground">
                Try changing your filter or search query.
              </p>
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

                        {lead.lastCalledAt && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span className="text-xs">
                              {(lead.lastCalledAt as any).toDate?.() 
                                ? (lead.lastCalledAt as any).toDate().toLocaleDateString() 
                                : new Date(lead.lastCalledAt).toLocaleDateString()}
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
                            {lead.leadStatus === "Follow-Up" && "Follow-Up"}
                            {lead.leadStatus === "Not Interested" && "Not Interested"}
                            {lead.leadStatus === "Completed" && "Completed"}
                            {lead.leadStatus === "Converted" && "Converted"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          <a
                            href={`tel:${lead.mobileNumber}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Call"
                          >
                            <Button size="icon" variant="ghost">
                              <Phone className="h-4 w-4" />
                            </Button>
                          </a>
                          <a
                            href={`https://wa.me/${lead.mobileNumber.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="WhatsApp"
                          >
                            <Button size="icon" variant="ghost">
                              <MessageCircle className="h-4 w-4 text-success" />
                            </Button>
                          </a>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartCall(lead.id);
                            }}
                            title="Log Call / Feedback"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
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
      {(stats?.convertedLeads ?? 0) > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="text-purple-900">⭐ My Converted Leads</CardTitle>
            <CardDescription className="text-purple-800">
              These are the leads you successfully handled that resulted in a conversion.
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
