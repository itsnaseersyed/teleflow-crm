import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  getDocs,
  serverTimestamp,
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
import { CALL_STATUSES } from "@/lib/lead-utils";
import { Phone, MessageCircle, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/calls/new")({
  component: NewCallPage,
});

function NewCallPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [customerName, setName] = useState("");
  const [mobileNumber, setMobile] = useState("");
  const [callStatus, setCallStatus] = useState("Connected");
  const [callNotes, setNotes] = useState("");
  const [followUpDate, setFollow] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const uid = user.uid;

      // 1. Log the call first (without leadId — will update below)
      const callRef = await addDoc(collection(db, "calls"), {
        telecallerId: uid,
        customerName,
        mobileNumber,
        callStatus,
        callNotes,
        followUpDate: followUpDate || null,
        createdAt: serverTimestamp(),
      });

      // 2. Find or create matching lead by mobile number
      const leadQuery = query(collection(db, "leads"), where("mobileNumber", "==", mobileNumber));
      const existing = await getDocs(leadQuery);
      const leadStatus = mapCallStatusToLead(callStatus);

      let leadId: string;

      if (!existing.empty) {
        // Update existing lead
        const existingDoc = existing.docs[0];
        leadId = existingDoc.id;
        await updateDoc(doc(db, "leads", leadId), {
          leadStatus,
          feedbackNotes: callNotes || null,
          followUpDate: followUpDate || null,
        });
      } else {
        // Create new lead
        const newLeadRef = await addDoc(collection(db, "leads"), {
          customerName,
          mobileNumber,
          leadStatus,
          feedbackNotes: callNotes || null,
          followUpDate: followUpDate || null,
          assignedTo: uid,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        leadId = newLeadRef.id;
      }

      // 3. Link call to lead
      await updateDoc(doc(db, "calls", callRef.id), { leadId });

      // 4. Create follow-up record if date provided
      if (followUpDate) {
        await addDoc(collection(db, "followups"), {
          leadId,
          telecallerId: uid,
          followupDate: followUpDate,
          notes: callNotes || null,
          status: "Pending",
          // Denormalize for easier querying on followups page
          customerName,
          mobileNumber,
          createdAt: serverTimestamp(),
        });
      }
    },
    onSuccess: () => {
      toast.success("Call logged successfully");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["my-converted-leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      nav({ to: "/leads" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Log a new call</h2>
        <p className="text-sm text-muted-foreground">
          Capture call details. We'll auto-update the lead and create a follow-up if needed.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="rounded-xl border bg-card shadow-card p-6 space-y-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Customer name</Label>
            <Input value={customerName} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Mobile number</Label>
            <div className="flex gap-2">
              <Input value={mobileNumber} onChange={(e) => setMobile(e.target.value)} required />
              <a href={`tel:${mobileNumber}`} className="shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!mobileNumber}
                  title="Click to call"
                >
                  <Phone className="h-4 w-4" />
                </Button>
              </a>
              <a
                href={`https://wa.me/${mobileNumber.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0"
              >
                <Button type="button" variant="outline" disabled={!mobileNumber} title="WhatsApp">
                  <MessageCircle className="h-4 w-4 text-success" />
                </Button>
              </a>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-1">
          <div className="space-y-2">
            <Label>Call status</Label>
            <Select value={callStatus} onValueChange={setCallStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Follow-up date</Label>
          <Input type="date" value={followUpDate} onChange={(e) => setFollow(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>Feedback / call notes</Label>
          <Textarea
            rows={4}
            value={callNotes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did the customer say?"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => nav({ to: "/leads" })}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submit.isPending}
            className="bg-gradient-accent text-white shadow-soft"
          >
            <Save className="h-4 w-4 mr-2" />
            {submit.isPending ? "Saving…" : "Save call"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function mapCallStatusToLead(s: string) {
  switch (s) {
    case "Interested":
      return "Interested";
    case "Not Interested":
      return "Not Interested";
    case "Converted":
      return "Converted";
    case "Busy":
      return "Busy";
    case "No Response":
      return "No Response";
    case "Wrong Number":
      return "Invalid Number";
    case "Follow-Up Needed":
      return "Follow-Up Needed";
    default:
      return "New Lead";
  }
}
