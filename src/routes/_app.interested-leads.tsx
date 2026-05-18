import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { collection, query, doc, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { useAllLeads, useLeadMutations } from "@/hooks/useLeads";
import { leadService } from "@/services/leadService";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  Phone,
  MessageCircle,
  Pencil,
  CheckCircle,
  User,
  MapPin,
  BookOpen,
  Calendar,
  AlertCircle,
  Clock,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/interested-leads")({
  component: InterestedLeadsPage,
});

import { Lead } from "@/services/firestore/types";

type UserType = {
  id: string;
  fullName: string;
  role: string;
};

function InterestedLeadsPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"latestCalled" | "oldestCalled" | "newestSourced">("latestCalled");
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Guard: Redirect non-admins to my-leads
  useEffect(() => {
    if (role && role !== "admin") {
      navigate({ to: "/my-leads" });
    }
  }, [role, navigate]);

  // Use non-paginated hook to fetch all interested leads
  const {
    data: leads = [],
    isLoading
  } = useAllLeads({ status: "Interested" }, { staleTime: 0, refetchOnWindowFocus: true });

  const { updateLead, updateStatus } = useLeadMutations();

  // Fetch all users (telecallers) to map names
  const { data: users = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const q = query(collection(db, "users"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        fullName: doc.data().fullName || doc.data().email || "User",
        role: doc.data().role,
      })) as UserType[];
    },
    enabled: role === "admin",
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Create lookup map of userId -> fullName
  const usersMap = new Map(users.map((u) => [u.id, u.fullName]));

  // Client-side search and filters
  const filtered = leads.filter((l) => {
    if (!q) return true;
    const s = q.toLowerCase();
    const telecallerName = usersMap.get(l.assignedTo || "")?.toLowerCase() || "unassigned";
    return (
      l.customerName.toLowerCase().includes(s) ||
      l.mobileNumber.includes(q) ||
      (l.city || "").toLowerCase().includes(s) ||
      telecallerName.includes(s)
    );
  });

  // Client-side sort by lastCalledAt or createdAt
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "latestCalled") {
      const aTime = a.lastCalledAt ? ((a.lastCalledAt as any).toDate ? (a.lastCalledAt as any).toDate().getTime() : new Date(a.lastCalledAt).getTime()) : 0;
      const bTime = b.lastCalledAt ? ((b.lastCalledAt as any).toDate ? (b.lastCalledAt as any).toDate().getTime() : new Date(b.lastCalledAt).getTime()) : 0;
      return bTime - aTime;
    }
    if (sortBy === "oldestCalled") {
      const aTime = a.lastCalledAt ? ((a.lastCalledAt as any).toDate ? (a.lastCalledAt as any).toDate().getTime() : new Date(a.lastCalledAt).getTime()) : Infinity;
      const bTime = b.lastCalledAt ? ((b.lastCalledAt as any).toDate ? (b.lastCalledAt as any).toDate().getTime() : new Date(b.lastCalledAt).getTime()) : Infinity;
      return aTime - bTime;
    }
    // Default to newestSourced: sort by createdAt desc
    const aTime = a.createdAt ? ((a.createdAt as any).toDate ? (a.createdAt as any).toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
    const bTime = b.createdAt ? ((b.createdAt as any).toDate ? (b.createdAt as any).toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
    return bTime - aTime;
  });


  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Clock className="h-10 w-10 text-gradient-accent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading interested leads...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight bg-gradient-accent bg-clip-text text-transparent">
            Interested Leads
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review and close deals for leads marked as Interested by telecallers.
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, city, course, or telecaller..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <div className="w-full sm:w-[200px]">
          <Select
            value={sortBy}
            onValueChange={(val: any) => setSortBy(val)}
          >
            <SelectTrigger className="bg-card w-full">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latestCalled">Latest Called</SelectItem>
              <SelectItem value="oldestCalled">Oldest Called</SelectItem>
              <SelectItem value="newestSourced">Recently Sourced</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card className="flex flex-col items-center justify-center text-center p-12 bg-card border">
          <CheckSquare className="h-12 w-12 text-muted-foreground/60 mb-3" />
          <p className="text-base font-semibold">No Interested Leads Found</p>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            Leads marked as "Interested" by your telecaller queue will appear here for admin review and closing.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sorted.map((lead) => {
            const assignedName = usersMap.get(lead.assignedTo || "") || "Unassigned";

            return (
              <Card
                key={lead.id}
                className="flex flex-col border-2 border-gradient-accent/10 hover:border-gradient-accent/20 transition-all shadow-soft bg-card overflow-hidden"
              >
                {/* Header */}
                <CardHeader className="pb-3 border-b border-muted">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-lg text-foreground truncate">
                        {lead.customerName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3 text-gradient-accent" />
                        <span>Assigned to: </span>
                        <span className="font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">
                          {assignedName}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 py-4 space-y-3.5 text-sm">
                  {lead.city && (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs md:text-sm">
                      <MapPin className="h-4 w-4 text-gradient-accent shrink-0" />
                      <span className="truncate">{lead.city}</span>
                    </div>
                  )}

                  {/* Feedback notes summary */}
                  {lead.feedbackNotes && (
                    <div className="p-3 bg-muted/60 rounded-lg text-xs leading-relaxed text-foreground border border-muted-foreground/10">
                      <p className="font-semibold text-muted-foreground mb-1 uppercase tracking-wider text-[10px]">
                        Last Call Feedback:
                      </p>
                      <p className="italic">"{lead.feedbackNotes}"</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-muted">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Sourced: { (lead.createdAt as any)?.toDate?.() 
                        ? (lead.createdAt as any).toDate().toLocaleDateString() 
                        : lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "N/A" }</span>
                    </div>
                    {lead.lastCalledAt && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Called: { (lead.lastCalledAt as any).toDate?.() 
                          ? (lead.lastCalledAt as any).toDate().toLocaleDateString() 
                          : new Date(lead.lastCalledAt).toLocaleDateString() }</span>
                      </div>
                    )}
                  </div>
                </CardContent>

                {/* Footer and Quick CTAs */}
                <CardFooter className="flex flex-col gap-3.5 bg-muted/20 border-t border-muted pt-4">
                  {/* Dial and WhatsApp Options */}
                  <div className="flex gap-2.5 w-full">
                    <a
                      href={`tel:${lead.mobileNumber}`}
                      className="flex-1 inline-flex items-center justify-center rounded-lg border-2 border-primary/20 bg-background text-primary hover:bg-primary/5 h-10 text-xs font-semibold gap-2 transition-colors cursor-pointer"
                    >
                      <Phone className="h-4 w-4" />
                      Call Customer
                    </a>
                    <a
                      href={`https://wa.me/91${lead.mobileNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center rounded-lg border-2 border-emerald-500/20 bg-emerald-50/40 text-emerald-600 hover:bg-emerald-500/5 h-10 text-xs font-semibold gap-2 transition-colors cursor-pointer"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </a>
                  </div>

                  {/* Admin Direct Mark-As-Complete and Edit Controls */}
                  <div className="flex gap-2.5 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingLead(lead)}
                      className="flex-1 gap-1.5 text-xs h-9"
                    >
                      <Pencil className="h-3.5 w-3.5 text-gradient-accent" />
                      Edit Details
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => updateStatus.mutate({
                        leadId: lead.id,
                        oldStatus: lead.leadStatus,
                        newStatus: "Converted"
                      })}
                      disabled={updateStatus.isPending}
                      className="flex-1 bg-gradient-accent text-white gap-1.5 text-xs h-9 shadow-soft"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Mark Converted
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}



      {/* Editing Dialog Modal */}
      {editingLead && (
        <Dialog open={!!editingLead} onOpenChange={(open) => !open && setEditingLead(null)}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Edit Lead Details</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Customer Name */}
                <div className="space-y-1">
                  <Label htmlFor="customerName">Customer Name</Label>
                  <Input
                    id="customerName"
                    value={editingLead.customerName}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, customerName: e.target.value })
                    }
                  />
                </div>

                {/* Mobile Number */}
                <div className="space-y-1">
                  <Label htmlFor="mobileNumber">Mobile Number</Label>
                  <Input
                    id="mobileNumber"
                    value={editingLead.mobileNumber}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, mobileNumber: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* City */}
                <div className="space-y-1">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={editingLead.city || ""}
                    onChange={(e) =>
                      setEditingLead({ ...editingLead, city: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* Status Selection */}
                <div className="space-y-1">
                  <Label htmlFor="leadStatus">Lead Status</Label>
                  <Select
                    value={editingLead.leadStatus}
                    onValueChange={(val) => setEditingLead({ ...editingLead, leadStatus: val as Lead["leadStatus"] })}
                  >
                    <SelectTrigger id="leadStatus">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Interested">Interested</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Follow-Up">Follow-Up</SelectItem>
                      <SelectItem value="Not Interested">Not Interested</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Feedback Notes */}
              <div className="space-y-1">
                <Label htmlFor="feedback">Feedback Notes</Label>
                <Textarea
                  id="feedback"
                  value={editingLead.feedbackNotes || ""}
                  onChange={(e) =>
                    setEditingLead({ ...editingLead, feedbackNotes: e.target.value })
                  }
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingLead(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  updateLead.mutate({
                    leadId: editingLead.id,
                    updates: {
                      customerName: editingLead.customerName,
                      mobileNumber: editingLead.mobileNumber,
                      city: editingLead.city,
                      leadStatus: editingLead.leadStatus,
                      feedbackNotes: editingLead.feedbackNotes,
                    },
                    oldStatus: leads.find(l => l.id === editingLead.id)?.leadStatus
                  })
                }
                disabled={updateLead.isPending}
                className="bg-gradient-accent text-white"
              >
                {updateLead.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
