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
import { useAuth } from "@/lib/auth";
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
      search: { from: "my-leads", status: filterStatus }
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
            <div className="flex gap-3 flex-col sm:flex-row w-full sm:w-auto">
              <Input
                placeholder="Search by name, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-64"
              />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Leads</SelectItem>
                  <SelectItem value="Assigned">Assigned / Ready</SelectItem>
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
            <div className="divide-y border rounded-lg overflow-hidden bg-white shadow-sm">
              {filteredLeads.map((lead, index) => (
                <div
                  key={lead.id}
                  className="flex items-center p-3 hover:bg-slate-50 transition-colors cursor-pointer gap-3 group"
                  onClick={() => handleStartCall(lead.id)}
                >
                  <div className="flex-shrink-0 text-[10px] font-bold text-slate-400 w-6 text-center">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {lead.customerName}
                      </p>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 whitespace-nowrap">
                        {lead.leadStatus === "Assigned" ? "Ready" : lead.leadStatus}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {lead.mobileNumber}
                      </span>
                      {lead.city && (
                        <span className="hidden sm:flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate max-w-[100px]">{lead.city}</span>
                        </span>
                      )}
                      {lead.lastCalledAt && (
                        <span className="hidden sm:flex items-center gap-1 opacity-70">
                          <Clock className="h-3 w-3" />
                          {(lead.lastCalledAt as any).toDate?.() 
                            ? (lead.lastCalledAt as any).toDate().toLocaleDateString() 
                            : new Date(lead.lastCalledAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-slate-300 group-hover:text-primary transition-colors">
                    <ChevronRight className="h-4 w-4" />
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
              <div className="divide-y border border-purple-100 rounded-lg overflow-hidden bg-white shadow-sm">
                {convertedLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center p-3 hover:bg-purple-50/50 transition-colors gap-3"
                  >
                    <div className="flex-shrink-0 text-green-500">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-purple-900 truncate">
                          {lead.customerName}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.mobileNumber}
                        </span>
                        {lead.city && (
                          <span className="hidden sm:flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[100px]">{lead.city}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-600 border border-green-100">
                        Converted
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
