import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Users,
  Send,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/lead-assignment")({
  component: LeadAssignmentPage,
});

interface Lead {
  id: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  interestedService?: string;
  priority?: string;
  leadStatus: string;
  assignedTo?: string;
  assignedAt?: Date;
  createdAt: Date;
}

interface User {
  id: string;
  fullName: string;
  email: string;
}

function LeadAssignmentPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeamLeader, setSelectedTeamLeader] = useState<string>("all");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [bulkAssignDialog, setBulkAssignDialog] = useState(false);
  const [bulkAssignTo, setBulkAssignTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("Unassigned");

  // Fetch leads
  const { data: leads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ["leads-assignment", statusFilter],
    enabled: !!user,
    queryFn: async () => {
      const q = query(
        collection(db, "leads"),
        where("leadStatus", "==", statusFilter),
        orderBy("createdAt", "desc"),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
        assignedAt: d.data().assignedAt?.toDate?.() || undefined,
      })) as Lead[];
    },
  });

  // Fetch telecallers
  const { data: telecallers = [] } = useQuery({
    queryKey: ["telecallers"],
    enabled: !!user,
    queryFn: async () => {
      const q = query(collection(db, "users"), where("role", "==", "telecaller"));
      const snap = await getDocs(q);
      return snap.docs.map(
        (d) =>
          ({
            id: d.id,
            ...d.data(),
          }) as User,
      );
    },
  });

  // Filter leads based on search and telecaller
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        !searchQuery ||
        lead.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.mobileNumber.includes(searchQuery) ||
        (lead.city || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesTeamLeader =
        selectedTeamLeader === "all" || lead.assignedTo === selectedTeamLeader;

      return matchesSearch && matchesTeamLeader;
    });
  }, [leads, searchQuery, selectedTeamLeader]);

  // Calculate stats
  const stats = useMemo(() => {
    return {
      total: leads.length,
      unassigned: leads.filter((l) => !l.assignedTo).length,
      assigned: leads.filter((l) => l.assignedTo).length,
      byTeamLeader: telecallers.map((tl) => ({
        id: tl.id,
        name: tl.fullName,
        count: leads.filter((l) => l.assignedTo === tl.id).length,
      })),
    };
  }, [leads, telecallers]);

  // Assign lead mutation
  const assignMutation = useMutation({
    mutationFn: async ({
      leadId,
      telecallerId,
    }: {
      leadId: string;
      telecallerId: string;
    }) => {
      await updateDoc(doc(db, "leads", leadId), {
        assignedTo: telecallerId,
        assignedAt: new Date(),
        leadStatus: "Assigned",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads-assignment"] });
      toast.success("Lead assigned successfully");
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async ({
      leadIds,
      telecallerId,
    }: {
      leadIds: string[];
      telecallerId: string;
    }) => {
      const batch = writeBatch(db);
      leadIds.forEach((leadId) => {
        batch.update(doc(db, "leads", leadId), {
          assignedTo: telecallerId,
          assignedAt: new Date(),
          leadStatus: "Assigned",
        });
      });
      await batch.commit();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads-assignment"] });
      setBulkAssignDialog(false);
      setSelectedLeads(new Set());
      setBulkAssignTo("");
      toast.success(`${selectedLeads.size} leads assigned successfully`);
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedLeads.size === filteredLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  const handleBulkAssign = () => {
    if (selectedLeads.size === 0 || !bulkAssignTo) {
      toast.error("Select leads and a telecaller");
      return;
    }

    bulkAssignMutation.mutate({
      leadIds: Array.from(selectedLeads),
      telecallerId: bulkAssignTo,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lead Assignment</h2>
          <p className="text-muted-foreground mt-1">
            Distribute leads to telecallers for efficient call handling
          </p>
        </div>
        {selectedLeads.size > 0 && (
          <Button
            onClick={() => setBulkAssignDialog(true)}
            className="bg-gradient-accent text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            Assign {selectedLeads.size} Lead{selectedLeads.size !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Total Leads</p>
              <p className="text-3xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-amber-700 mb-1">Unassigned</p>
              <p className="text-3xl font-bold text-amber-700">{stats.unassigned}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-green-700 mb-1">Assigned</p>
              <p className="text-3xl font-bold text-green-700">{stats.assigned}</p>
            </div>
          </CardContent>
        </Card>
        <Card colSpan={2}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By Telecaller</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.byTeamLeader.slice(0, 3).map((tc) => (
              <div key={tc.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{tc.name}</span>
                <span className="font-semibold">{tc.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="Unassigned">Unassigned</TabsTrigger>
          <TabsTrigger value="Assigned">Assigned</TabsTrigger>
          <TabsTrigger value="In Progress">In Progress</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Leads</CardTitle>
                  <CardDescription>
                    {filteredLeads.length} of {leads.length} leads
                  </CardDescription>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1 sm:flex-none sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, phone, city..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={selectedTeamLeader} onValueChange={setSelectedTeamLeader}>
                    <SelectTrigger className="sm:w-56">
                      <SelectValue placeholder="Filter by telecaller" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All telecallers</SelectItem>
                      {telecallers.map((tc) => (
                        <SelectItem key={tc.id} value={tc.id}>
                          {tc.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {leadsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No leads found</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {statusFilter === "Unassigned" && (
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedLeads.size === filteredLeads.length}
                              onCheckedChange={handleSelectAll}
                            />
                          </TableHead>
                        )}
                        <TableHead>Customer</TableHead>
                        <TableHead className="hidden md:table-cell">Phone</TableHead>
                        <TableHead className="hidden lg:table-cell">City</TableHead>
                        <TableHead className="hidden lg:table-cell">Service</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeads.map((lead) => (
                        <TableRow key={lead.id} className="hover:bg-muted/50">
                          {statusFilter === "Unassigned" && (
                            <TableCell>
                              <Checkbox
                                checked={selectedLeads.has(lead.id)}
                                onCheckedChange={() => handleSelectLead(lead.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{lead.customerName}</p>
                              <p className="text-xs text-muted-foreground">{lead.mobileNumber}</p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            {lead.mobileNumber}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {lead.city || "-"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {lead.interestedService || "-"}
                          </TableCell>
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
                          <TableCell className="text-sm">
                            {lead.assignedTo
                              ? telecallers.find((t) => t.id === lead.assignedTo)?.fullName ||
                                "Unknown"
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {!lead.assignedTo && (
                              <AssignLeadDialog
                                lead={lead}
                                telecallers={telecallers}
                                onAssign={(telecallerId) => {
                                  assignMutation.mutate({
                                    leadId: lead.id,
                                    telecallerId,
                                  });
                                }}
                                isLoading={assignMutation.isPending}
                              />
                            )}
                            {lead.assignedTo && (
                              <ReassignLeadDialog
                                lead={lead}
                                telecallers={telecallers}
                                onAssign={(telecallerId) => {
                                  assignMutation.mutate({
                                    leadId: lead.id,
                                    telecallerId,
                                  });
                                }}
                                isLoading={assignMutation.isPending}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bulk Assign Dialog */}
      <Dialog open={bulkAssignDialog} onOpenChange={setBulkAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selectedLeads.size} Leads</DialogTitle>
            <DialogDescription>
              Select a telecaller to assign all selected leads
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm font-semibold mb-3">Assign to Telecaller</p>
              <Select value={bulkAssignTo} onValueChange={setBulkAssignTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select telecaller..." />
                </SelectTrigger>
                <SelectContent>
                  {telecallers.map((tc) => (
                    <SelectItem key={tc.id} value={tc.id}>
                      {tc.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {bulkAssignTo && (
              <Card className="bg-blue-50">
                <CardContent className="pt-4">
                  <p className="text-sm">
                    <strong>{selectedLeads.size} leads</strong> will be assigned to{" "}
                    <strong>
                      {telecallers.find((t) => t.id === bulkAssignTo)?.fullName}
                    </strong>
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkAssignDialog(false)}
              disabled={bulkAssignMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkAssign}
              disabled={!bulkAssignTo || bulkAssignMutation.isPending}
              className="bg-gradient-accent text-white"
            >
              {bulkAssignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Confirm Assignment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssignLeadDialog({
  lead,
  telecallers,
  onAssign,
  isLoading,
}: {
  lead: Lead;
  telecallers: User[];
  onAssign: (id: string) => void;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  const handleAssign = () => {
    if (selectedId) {
      onAssign(selectedId);
      setOpen(false);
      setSelectedId("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
      >
        <Send className="h-4 w-4" />
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Lead</DialogTitle>
          <DialogDescription>Assign this lead to a telecaller</DialogDescription>
        </DialogHeader>

        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Select telecaller..." />
          </SelectTrigger>
          <SelectContent>
            {telecallers.map((tc) => (
              <SelectItem key={tc.id} value={tc.id}>
                {tc.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedId || isLoading}
            className="bg-gradient-accent text-white"
          >
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignLeadDialog({
  lead,
  telecallers,
  onAssign,
  isLoading,
}: {
  lead: Lead;
  telecallers: User[];
  onAssign: (id: string) => void;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(lead.assignedTo || "");

  const handleReassign = () => {
    if (selectedId && selectedId !== lead.assignedTo) {
      onAssign(selectedId);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
      >
        <RotateCw className="h-4 w-4" />
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign Lead</DialogTitle>
          <DialogDescription>
            Currently assigned to: {telecallers.find((t) => t.id === lead.assignedTo)?.fullName}
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Select telecaller..." />
          </SelectTrigger>
          <SelectContent>
            {telecallers.map((tc) => (
              <SelectItem key={tc.id} value={tc.id}>
                {tc.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleReassign}
            disabled={selectedId === lead.assignedTo || isLoading}
            className="bg-gradient-accent text-white"
          >
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
