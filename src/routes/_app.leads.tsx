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
import { LEAD_STATUSES, PRIORITIES, statusBadgeClass, priorityBadgeClass } from "@/lib/lead-utils";
import { Plus, Search, Phone, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/leads")({
  component: LeadsPage,
});

type Lead = {
  id: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  interestedCourse?: string;
  leadStatus: string;
  feedbackNotes?: string;
  followUpDate?: string;
  assignedTo?: string;
  priority: string;
  createdAt: Date;
  createdBy: string;
};

function LeadsPage() {
  const { role, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [editing, setEditing] = useState<Lead | null>(null);
  const [open, setOpen] = useState(false);

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
        await updateDoc(doc(db, "leads", editing.id), form);
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
    },
    onError: (e: any) => toast.error(e.message),
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
      </div>

      <div className="rounded-xl border bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">City</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Course</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Priority</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    No leads found. Click "Add Lead" to create one.
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.customerName}</div>
                    <div className="text-xs text-muted-foreground">{l.mobileNumber}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">{l.city || "—"}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{l.interestedCourse || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${statusBadgeClass(l.leadStatus)}`}
                    >
                      {l.leadStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span
                      className={`text-xs px-2 py-1 rounded-full border ${priorityBadgeClass(l.priority)}`}
                    >
                      {l.priority}
                    </span>
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
      </div>
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
  const [interestedCourse, setCourse] = useState(initial?.interestedCourse ?? "");
  const [leadStatus, setStatus] = useState(initial?.leadStatus ?? "New Lead");
  const [priority, setPriority] = useState(initial?.priority ?? "Medium");
  const [feedbackNotes, setNotes] = useState(initial?.feedbackNotes ?? "");
  const [followUpDate, setFollow] = useState(initial?.followUpDate?.slice(0, 10) ?? "");
  const [assignedTo, setAssigned] = useState(initial?.assignedTo || "unassigned");

  return (
    <DialogContent className="sm:max-w-lg">
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Interested course">
            <Input value={interestedCourse} onChange={(e) => setCourse(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
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
          <Field label="Priority">
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((s) => (
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
              interestedCourse,
              leadStatus,
              priority,
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
