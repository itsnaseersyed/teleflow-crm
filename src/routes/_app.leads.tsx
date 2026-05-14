import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query,
  orderBy,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  where,
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { LEAD_STATUSES, statusBadgeClass } from "@/lib/lead-utils";
import { Plus, Search, Phone, MessageCircle, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { writeBatch } from "firebase/firestore";

export const Route = createFileRoute("/_app/leads")({
  component: LeadsPage,
});

type Lead = {
  id: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  leadStatus: string;
  feedbackNotes?: string;
  followUpDate?: string;
  assignedTo?: string;
  createdAt: Date;
  createdBy: string;
  uploadBatchId?: string;
  // Escalation fields
  sourcedBy?: string; // Junior who sourced the lead
  handledBy?: string; // Senior who closed it
  escalationStatus?: "none" | "pending_senior" | "closed_by_senior"; // Escalation status
  escalatedAt?: Date; // When escalated
  escalationNotes?: string; // Notes from junior
};

type LeadImportBatch = {
  id: string;
  dayIdentifier?: string;
  batchStatus?: string;
  uploadedAt?: Date;
};

function LeadsPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [escalationFilter, setEscalationFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      })) as Lead[];
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const q = query(collection(db, "leadImportBatches"), orderBy("uploadedAt", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        uploadedAt: doc.data().uploadedAt?.toDate?.() || new Date(),
      })) as LeadImportBatch[];
    },
  });

  const { data: telecallers = [] } = useQuery({
    queryKey: ["telecallers"],
    queryFn: async () => {
      const q = query(collection(db, "users"), where("role", "==", "telecaller"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => ({ id: d.id, name: d.data().fullName }));
    },
    enabled: role === "admin",
  });

  const filtered = leads.filter((l) => {
    if (status !== "all" && l.leadStatus !== status) return false;
    if (escalationFilter !== "all" && l.escalationStatus !== escalationFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      l.customerName.toLowerCase().includes(s) ||
      l.mobileNumber.includes(q) ||
      (l.city || "").toLowerCase().includes(s)
    );
  });

  const upsert = useMutation({
    mutationFn: async (form: Partial<Lead>) => {
      if (editing) {
        // Check if this is a senior closing an escalated lead
        const leadToUpdate = leads.find((l) => l.id === editing.id);
        if (
          leadToUpdate?.escalationStatus === "pending_senior" &&
          leadToUpdate?.sourcedBy &&
          form.leadStatus === "Completed"
        ) {
          // Senior closed the deal - mark as closed_by_senior and assign back to junior
          await updateDoc(doc(db, "leads", editing.id), {
            ...form,
            escalationStatus: "closed_by_senior",
            handledBy: user?.uid, // Mark which senior closed it
            assignedTo: leadToUpdate.sourcedBy, // Assign back to junior who sourced it
          });
        } else {
          await updateDoc(doc(db, "leads", editing.id), form);
        }
      } else {
        const leadRef = doc(collection(db, "leads"));
        await setDoc(leadRef, {
          ...form,
          createdBy: user?.uid,
          createdAt: new Date(),
        });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Lead updated" : "Lead added");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["my-converted-leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, "leads", id));
    },
    onSuccess: () => {
      toast.success("Lead deleted");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["my-converted-leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkDel = useMutation({
    mutationFn: async (ids: string[]) => {
      const batch = writeBatch(db);
      ids.forEach((id) => {
        batch.delete(doc(db, "leads", id));
      });
      await batch.commit();
    },
    onSuccess: () => {
      toast.success(`${selected.size} lead(s) deleted`);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["my-converted-leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      setSelected(new Set());
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleBatchExpand = (batchId: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(batchId)) {
      newExpanded.delete(batchId);
    } else {
      newExpanded.add(batchId);
    }
    setExpanded(newExpanded);
  };

  // Group leads by batch
  const leadsByBatch = filtered.reduce(
    (acc, lead) => {
      const batchId = lead.uploadBatchId || "unassigned";
      if (!acc[batchId]) {
        acc[batchId] = [];
      }
      acc[batchId].push(lead);
      return acc;
    },
    {} as Record<string, Lead[]>
  );

  const batchList = Object.entries(leadsByBatch)
    .sort(([aId], [bId]) => {
      const batchA = batches.find((bat) => bat.id === aId);
      const batchB = batches.find((bat) => bat.id === bId);
      const timeA = batchA?.uploadedAt || new Date(0);
      const timeB = batchB?.uploadedAt || new Date(0);
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Leads</h2>
          <p className="text-sm text-muted-foreground">
            Manage your pipeline. {filtered.length} of {leads.length} shown.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-gradient-accent text-white shadow-soft hover:opacity-95">
              <Plus className="h-4 w-4 mr-2" /> Add Lead
            </Button>
          </DialogTrigger>
          <LeadDialog
            initial={editing}
            telecallers={telecallers}
            isAdmin={role === "admin"}
            onSubmit={(f) => upsert.mutate(f)}
            saving={upsert.isPending}
          />
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone or city"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={escalationFilter} onValueChange={setEscalationFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Escalation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All leads</SelectItem>
            <SelectItem value="pending_senior">🔼 Pending Senior</SelectItem>
            <SelectItem value="closed_by_senior">✓ Closed by Senior</SelectItem>
            <SelectItem value="none">No escalation</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-blue-900">{selected.size} lead(s) selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm(`Delete ${selected.size} lead(s)? This cannot be undone.`)) {
                  bulkDel.mutate(Array.from(selected));
                }
              }}
              disabled={bulkDel.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">No leads found. Click "Add Lead" to create one.</div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-4">
        {batchList.map(([batchId, batchLeads]) => {
          const batch = batches.find((b) => b.id === batchId);
          const isExpanded = expanded.has(batchId);
          const assignedCount = batchLeads.filter((l) => l.assignedTo).length;
          const completedCount = batchLeads.filter((l) => l.leadStatus === "Completed").length;
          const batchSelectedCount = batchLeads.filter((l) => selected.has(l.id)).length;

          return (
            <div key={batchId} className="rounded-lg border bg-card shadow-card overflow-hidden">
              {/* Batch Header */}
              <div
                className="bg-gradient-to-r from-slate-50 to-slate-100 px-4 py-3 border-b cursor-pointer hover:from-slate-100 hover:to-slate-200 flex items-center justify-between"
                onClick={() => toggleBatchExpand(batchId)}
              >
                <div className="flex items-center gap-3 flex-1">
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">
                        {batch?.dayIdentifier || "Manual Leads"}
                      </span>
                      <span className="text-xs text-muted-foreground bg-slate-200 px-2 py-1 rounded">
                        {batchLeads.length} leads
                      </span>
                      {batch?.batchStatus === "active" && (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      )}
                      {batch?.batchStatus === "completed" && (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Completed
                        </span>
                      )}
                      {batch?.batchStatus === "archived" && (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {assignedCount} assigned • {completedCount} completed
                    </div>
                  </div>
                </div>
              </div>

              {/* Batch Leads Table */}
              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr className="text-left">
                        {role === "admin" && (
                          <th className="px-4 py-3 font-medium w-10">
                            <Checkbox
                              checked={batchSelectedCount > 0 && batchSelectedCount === batchLeads.length}
                              onCheckedChange={() => {
                                const newSelected = new Set(selected);
                                if (batchSelectedCount > 0 && batchSelectedCount === batchLeads.length) {
                                  batchLeads.forEach((l) => newSelected.delete(l.id));
                                } else {
                                  batchLeads.forEach((l) => newSelected.add(l.id));
                                }
                                setSelected(newSelected);
                              }}
                              aria-label="Select all in batch"
                            />
                          </th>
                        )}
                        <th className="px-4 py-3 font-medium">Customer</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">City</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {batchLeads.map((l) => (
                        <tr key={l.id} className={`hover:bg-muted/30 ${selected.has(l.id) ? "bg-blue-50" : ""}`}>
                          {role === "admin" && (
                            <td className="px-4 py-3">
                              <Checkbox
                                checked={selected.has(l.id)}
                                onCheckedChange={() => toggleSelect(l.id)}
                                aria-label="Select lead"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="font-medium">{l.customerName}</div>
                            <div className="text-xs text-muted-foreground">{l.mobileNumber}</div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">{l.city || "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              {(() => {
                                if (l.assignedTo) {
                                  const telecaller = telecallers.find((t) => t.id === l.assignedTo);
                                  if (telecaller) {
                                    const truncatedName = telecaller.name.substring(0, 4).toUpperCase();
                                    return (
                                      <span
                                        className="text-xs px-2 py-1 rounded-full border font-semibold bg-blue-50 border-blue-200 text-blue-700 cursor-help"
                                        title={telecaller.name}
                                      >
                                        {truncatedName}
                                      </span>
                                    );
                                  }
                                }
                                return (
                                  <span
                                    className={`text-xs px-2 py-1 rounded-full border ${statusBadgeClass(l.leadStatus)}`}
                                  >
                                    {l.leadStatus}
                                  </span>
                                );
                              })()}
                              
                              {/* Escalation Badge */}
                              {l.escalationStatus === "pending_senior" && (
                                <span className="text-xs px-2 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-700 font-semibold">
                                  🔼 Escalated to Senior
                                </span>
                              )}
                              {l.escalationStatus === "closed_by_senior" && (
                                <span className="text-xs px-2 py-1 rounded-full border border-green-300 bg-green-50 text-green-700 font-semibold">
                                  ✓ Closed by Senior
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <a href={`tel:${l.mobileNumber}`}>
                                <Button size="icon" variant="ghost" title="Call">
                                  <Phone className="h-4 w-4" />
                                </Button>
                              </a>
                              <a
                                href={`https://wa.me/${l.mobileNumber.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Button size="icon" variant="ghost" title="WhatsApp">
                                  <MessageCircle className="h-4 w-4 text-success" />
                                </Button>
                              </a>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditing(l);
                                  setOpen(true);
                                }}
                                title="Edit"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {role === "admin" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    if (confirm("Delete this lead?")) del.mutate(l.id);
                                  }}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}

function LeadDialog({
  initial,
  telecallers,
  isAdmin,
  onSubmit,
  saving,
}: {
  initial: Lead | null;
  telecallers: { id: string; name: string }[];
  isAdmin: boolean;
  onSubmit: (form: any) => void;
  saving: boolean;
}) {
  const [customerName, setName] = useState(initial?.customerName ?? "");
  const [mobileNumber, setMobile] = useState(initial?.mobileNumber ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [leadStatus, setStatus] = useState(initial?.leadStatus ?? "New Lead");
  const [feedbackNotes, setNotes] = useState(initial?.feedbackNotes ?? "");
  const [followUpDate, setFollow] = useState(initial?.followUpDate?.slice(0, 10) ?? "");
  const [assignedTo, setAssigned] = useState(initial?.assignedTo || "unassigned");

  return (
    <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
      <DialogHeader>
        <DialogTitle>{initial ? "Edit lead" : "New lead"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer name">
            <Input value={customerName} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Mobile number">
            <Input value={mobileNumber} onChange={(e) => setMobile(e.target.value)} required />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Status">
            <Select value={leadStatus} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Follow-up date">
            <Input type="date" value={followUpDate} onChange={(e) => setFollow(e.target.value)} />
          </Field>
          {isAdmin && (
            <Field label="Assign to">
              <Select
                value={assignedTo}
                onValueChange={(v) => setAssigned(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {telecallers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <Field label="Feedback notes">
          <Textarea rows={3} value={feedbackNotes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <Button
          disabled={saving}
          onClick={() =>
            onSubmit({
              customerName,
              mobileNumber,
              city,
              leadStatus,
              feedbackNotes,
              followUpDate: followUpDate || null,
              assignedTo: assignedTo === "unassigned" ? null : assignedTo,
            })
          }
          className="bg-gradient-accent text-white"
        >
          {saving ? "Saving…" : initial ? "Update lead" : "Create lead"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
