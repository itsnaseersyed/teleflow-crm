import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Phone,
  ChevronLeft,
  ChevronRight,
  Save,
  MapPin,
  Target,
  Zap,
  Calendar,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowUp,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/lead/$leadId/call")({
  component: CallPage,
});

const CALL_STATUSES = [
  "Interested",
  "Follow-Up Needed",
  "Not Interested",
  "Busy",
  "No Response",
  "Switched Off",
  "Converted",
  "Invalid Number",
];

interface Lead {
  id: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  leadStatus: string;
  lastCallStatus?: string;
  lastCalledAt?: Date;
  feedbackNotes?: string;
  followUpDate?: string;
}

interface CallRecord {
  leadId: string;
  callStatus: string;
  feedbackNotes: string;
  followUpDate?: string;
  duration?: number;
}

function CallPage() {
  const { leadId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [callStatus, setCallStatus] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isCallActive, setIsCallActive] = useState(false);
  


  // Fetch current lead
  const { data: currentLead, isLoading: leadLoading } = useQuery({
    queryKey: ["lead", leadId],
    enabled: !!leadId && !!user,
    queryFn: async () => {
      const snap = await getDoc(doc(db, "leads", leadId));

      if (!snap.exists()) throw new Error("Lead not found");

      return {
        id: snap.id,
        ...(snap.data() as any),
        createdAt: snap.data().createdAt?.toDate?.() || new Date(),
        lastCalledAt: snap.data().lastCalledAt?.toDate?.() || undefined,
      } as Lead;
    },
  });

  // Fetch all user's assigned leads for navigation
  const { data: allLeads = [] } = useQuery({
    queryKey: ["user-leads", user?.uid],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];

      const q = query(collection(db, "leads"), where("assignedTo", "==", user.uid));

      const snap = await getDocs(q);
      const leadsList = snap.docs
        .map((d) => ({
          id: d.id,
          customerName: d.data().customerName,
          leadStatus: d.data().leadStatus,
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        }))
        .filter((l) => l.leadStatus === "Assigned");

      // Sort by createdAt in ascending order (client-side)
      return leadsList.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(({ id, customerName }) => ({ id, customerName }));
    },
  });



  // Calculate current position in queue
  const currentIndex = allLeads.findIndex((l) => l.id === leadId);
  const hasNext = currentIndex < allLeads.length - 1;
  const hasPrev = currentIndex > 0;



  // Handle call save
  const saveMutation = useMutation({
    mutationFn: async (data: CallRecord) => {
      if (!user || !currentLead) throw new Error("Missing context");

      const callRef = await addDoc(collection(db, "calls"), {
        leadId: currentLead.id,
        telecallerId: user.uid,
        customerName: currentLead.customerName,
        mobileNumber: currentLead.mobileNumber,
        city: currentLead.city || null,
        callStatus: data.callStatus,
        feedbackNotes: data.feedbackNotes,
        followUpDate: data.followUpDate || null,
        callDuration: callDuration,
        createdAt: serverTimestamp(),
      });

      // Update lead status
      const leadUpdateStatus =
        data.callStatus === "Interested"
          ? "Interested"
          : data.callStatus === "Converted"
            ? "Completed"
            : data.callStatus === "Follow-Up Needed"
              ? "Follow-Up"
              : data.callStatus === "Not Interested"
                ? "Not Interested"
                : "In Progress";

      await updateDoc(doc(db, "leads", currentLead.id), {
        lastCallStatus: data.callStatus,
        lastCalledAt: serverTimestamp(),
        feedbackNotes: data.feedbackNotes,
        followUpDate: data.followUpDate || null,
        leadStatus: leadUpdateStatus,
      });

      // Create follow-up if needed
      if (data.followUpDate) {
        await addDoc(collection(db, "followups"), {
          leadId: currentLead.id,
          telecallerId: user.uid,
          followupDate: new Date(data.followUpDate),
          status: "Pending",
          createdAt: serverTimestamp(),
        });
      }

      return callRef.id;
    },
    onSuccess: async () => {
      toast.success("Call saved successfully!");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["my-leads"] });
      qc.invalidateQueries({ queryKey: ["my-converted-leads"] });
      qc.invalidateQueries({ queryKey: ["user-leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });



      // Auto go to next lead
      if (hasNext) {
        setTimeout(() => {
          navigate({
            to: "/lead/$leadId/call",
            params: { leadId: allLeads[currentIndex + 1].id },
          });
        }, 500);
      } else {
        setTimeout(() => {
          navigate({ to: "/my-leads" });
        }, 500);
      }
    },
    onError: (err: any) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const handleSaveCall = () => {
    if (!callStatus) {
      toast.error("Please select a call status");
      return;
    }

    saveMutation.mutate({
      leadId: leadId!,
      callStatus,
      feedbackNotes,
      followUpDate: followUpDate || undefined,
    });
  };

  const handleNavigation = (direction: "prev" | "next") => {
    const newIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex < allLeads.length) {
      navigate({
        to: "/lead/$leadId/call",
        params: { leadId: allLeads[newIndex].id },
      });
      setCallStatus("");
      setFeedbackNotes("");
      setFollowUpDate("");
      setCallDuration(0);
      setIsCallActive(false);
    }
  };

  if (leadLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentLead) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Lead not found</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/my-leads" })}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Queue
        </Button>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Lead {currentIndex + 1} of {allLeads.length}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleNavigation("prev")}
            disabled={!hasPrev}
            title="Previous lead"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleNavigation("next")}
            disabled={!hasNext}
            title="Next lead"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <CardTitle className="text-2xl">{currentLead.customerName}</CardTitle>
                  <CardDescription>{currentLead.mobileNumber}</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex gap-3 mb-4">
                <a
                  href={`tel:${currentLead.mobileNumber}`}
                  className="flex-1"
                >
                  <Button
                    className="w-full bg-gradient-accent text-white gap-2 font-semibold"
                  >
                    <Phone className="h-4 w-4" />
                    Dial Number
                  </Button>
                </a>
                <a
                  href={`https://wa.me/${currentLead.mobileNumber.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1"
                >
                  <Button
                    variant="outline"
                    className="w-full border-success text-success hover:bg-success/10 gap-2 font-semibold"
                  >
                    <MessageCircle className="h-4 w-4 text-success" />
                    WhatsApp
                  </Button>
                </a>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {currentLead.city && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">City</p>
                      <p className="font-medium">{currentLead.city}</p>
                    </div>
                  </div>
                )}
              </div>



              {currentLead.lastCallStatus && (
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <p className="text-xs font-semibold mb-1">Previous Call</p>
                    <p className="text-sm">
                      Last Status: <strong>{currentLead.lastCallStatus}</strong>
                    </p>
                    {currentLead.feedbackNotes && (
                      <p className="text-sm mt-1">Notes: {currentLead.feedbackNotes}</p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Call Details</CardTitle>
              <CardDescription>Update the call status and add notes</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="call-status" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Call Status *
                </Label>
                <Select
                  value={callStatus}
                  onValueChange={setCallStatus}
                >
                  <SelectTrigger id="call-status">
                    <SelectValue placeholder="Select call status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CALL_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Feedback Notes
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Add any notes from the call..."
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="follow-up" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Follow-up Date (Optional)
                </Label>
                <Input
                  id="follow-up"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-4 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: "/my-leads" })}
                  disabled={saveMutation.isPending}
                >
                  Cancel
                </Button>
                
                <Button
                  onClick={handleSaveCall}
                  disabled={saveMutation.isPending || !callStatus}
                  className="flex-1 bg-gradient-accent text-white gap-2"
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save & {hasNext ? "Next" : "Finish"}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Queue Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Position: {currentIndex + 1} / {allLeads.length}</span>
                    <span className="text-sm text-muted-foreground">
                      {Math.round(((currentIndex + 1) / allLeads.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-accent h-full transition-all"
                      style={{
                        width: `${((currentIndex + 1) / allLeads.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {allLeads.slice(currentIndex, currentIndex + 3).map((lead, idx) => (
                  <div
                    key={lead.id}
                    className={`p-2 rounded-lg text-sm ${
                      idx === 0
                        ? "bg-gradient-accent/10 border border-gradient-accent/30 font-semibold"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {idx === 0 && <CheckCircle2 className="h-4 w-4 text-gradient-accent" />}
                      <span className="flex-1 truncate">{lead.customerName}</span>
                      {idx !== 0 && <span className="text-xs">+{idx}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
