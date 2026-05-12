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
import { acquireLock, releaseLock, refreshLock, checkLockStatus, formatRemainingLockTime, type LockStatus } from "@/lib/lead-lock";
import { useLockRealtime } from "@/lib/lock-realtime";
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
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/lead/$leadId/call")({
  component: CallPage,
  params: {
    validate: (params) => ({
      leadId: params.leadId,
    }),
  },
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
  interestedService?: string;
  priority?: string;
  remarks?: string;
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
  
  // Escalation state
  const [showEscalationDialog, setShowEscalationDialog] = useState(false);
  const [selectedSenior, setSelectedSenior] = useState("");
  const [escalationNotes, setEscalationNotes] = useState("");
  
  // Lock management
  const [lockAcquired, setLockAcquired] = useState(false);
  const lockRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { lockStatus, loading: lockLoading } = useLockRealtime(leadId, user?.uid);

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

  // Fetch all telecallers for escalation
  const { data: telecallers = [] } = useQuery({
    queryKey: ["telecallers"],
    queryFn: async () => {
      const q = query(collection(db, "users"), where("role", "==", "telecaller"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, fullName: d.data().fullName }));
    },
  });

  // Calculate current position in queue
  const currentIndex = allLeads.findIndex((l) => l.id === leadId);
  const hasNext = currentIndex < allLeads.length - 1;
  const hasPrev = currentIndex > 0;

  // Acquire lock when component mounts
  useEffect(() => {
    if (!leadId || !user || !user.uid || lockAcquired || lockLoading) return;

    const acquireLockAsync = async () => {
      const success = await acquireLock(leadId, user.uid, user.displayName || "User");
      if (success) {
        setLockAcquired(true);
        toast.success("Lead locked for editing");

        // Set up lock refresh interval (every 1 minute)
        const interval = setInterval(async () => {
          await refreshLock(leadId, user.uid);
        }, 60000); // 60 seconds

        lockRefreshIntervalRef.current = interval;
      } else {
        toast.error("This lead is being handled by another user");
        // Navigate back after 2 seconds
        setTimeout(() => navigate({ to: "/my-leads" }), 2000);
      }
    };

    acquireLockAsync();

    return () => {
      if (lockRefreshIntervalRef.current) {
        clearInterval(lockRefreshIntervalRef.current);
      }
    };
  }, [leadId, user, lockAcquired, lockLoading]);

  // Release lock when component unmounts or when leaving page
  const handleReleaseLock = async () => {
    if (lockAcquired && leadId && user?.uid) {
      if (lockRefreshIntervalRef.current) {
        clearInterval(lockRefreshIntervalRef.current);
      }
      await releaseLock(leadId, user.uid);
      setLockAcquired(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handleReleaseLock();
    };
  }, []);

  // Handle call save
  const saveMutation = useMutation({
    mutationFn: async (data: CallRecord) => {
      if (!user || !currentLead) throw new Error("Missing context");

      const callRef = await addDoc(collection(db, "calls"), {
        leadId: currentLead.id,
        telecallerId: user.uid,
        customerName: currentLead.customerName,
        mobileNumber: currentLead.mobileNumber,
        city: currentLead.city,
        interestedService: currentLead.interestedService,
        callStatus: data.callStatus,
        feedbackNotes: data.feedbackNotes,
        followUpDate: data.followUpDate || null,
        callDuration: callDuration,
        createdAt: serverTimestamp(),
      });

      // Update lead status
      const leadUpdateStatus =
        data.callStatus === "Converted"
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
      qc.invalidateQueries({ queryKey: ["lead", leadId] });

      // Release lock before navigating
      await handleReleaseLock();

      // Auto go to next lead
      if (hasNext) {
        setTimeout(() => {
          navigate({
            to: "/app/lead/$leadId/call",
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

  // Handle escalation to senior
  const escalateMutation = useMutation({
    mutationFn: async () => {
      if (!user || !currentLead || !selectedSenior) throw new Error("Missing escalation data");

      // Create call record first
      await addDoc(collection(db, "calls"), {
        leadId: currentLead.id,
        telecallerId: user.uid,
        customerName: currentLead.customerName,
        mobileNumber: currentLead.mobileNumber,
        city: currentLead.city,
        interestedService: currentLead.interestedService,
        callStatus: "Interested",
        feedbackNotes: escalationNotes,
        callDuration: callDuration,
        createdAt: serverTimestamp(),
      });

      // Update lead with escalation info
      await updateDoc(doc(db, "leads", currentLead.id), {
        sourcedBy: user.uid, // Mark junior who sourced it
        handledBy: selectedSenior, // Mark senior who will close it
        escalationStatus: "pending_senior",
        escalatedAt: serverTimestamp(),
        escalationNotes: escalationNotes,
        assignedTo: selectedSenior, // Assign to senior
        lastCallStatus: "Interested",
        lastCalledAt: serverTimestamp(),
        leadStatus: "In Progress",
        feedbackNotes: escalationNotes,
      });

      return true;
    },
    onSuccess: async () => {
      toast.success("Lead escalated to senior telecaller!");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["user-leads"] });

      // Release lock before navigating
      await handleReleaseLock();

      setShowEscalationDialog(false);
      setTimeout(() => {
        if (hasNext) {
          navigate({
            to: "/app/lead/$leadId/call",
            params: { leadId: allLeads[currentIndex + 1].id },
          });
        } else {
          navigate({ to: "/my-leads" });
        }
      }, 500);
    },
    onError: (err: any) => {
      toast.error(`Escalation failed: ${err.message}`);
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

  const handleCallStart = () => {
    // In a real app, this would integrate with a VoIP service
    setIsCallActive(true);
    setCallStartTime(Date.now());
    toast.success(`Calling ${currentLead?.customerName}...`);

    // Simulate call timer
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  };

  const handleCallEnd = () => {
    setIsCallActive(false);
    setCallStartTime(null);
  };

  const handleNavigation = (direction: "prev" | "next") => {
    const newIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (newIndex >= 0 && newIndex < allLeads.length) {
      navigate({
        to: "/app/lead/$leadId/call",
        params: { leadId: allLeads[newIndex].id },
      });
      // Reset form
      setCallStatus("");
      setFeedbackNotes("");
      setFollowUpDate("");
      setCallDuration(0);
      setIsCallActive(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
      {/* Lock Status Warning */}
      {lockStatus.isLocked && !lockStatus.isLockedByCurrentUser && (
        <Alert variant="destructive" className="flex items-start gap-3">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <AlertDescription>
            <p className="font-semibold">Lead Locked</p>
            <p className="text-sm">
              This lead is currently being handled by <strong>{lockStatus.lockedByName}</strong> since{" "}
              {lockStatus.lockedAt?.toLocaleTimeString()}. Please try another lead.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {lockStatus.isLockedByCurrentUser && (
        <Alert className="flex items-start gap-3 bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
          <AlertDescription className="text-amber-900">
            <p className="font-semibold">You are handling this lead</p>
            <p className="text-sm">
              Lock expires in {formatRemainingLockTime(lockStatus.lockExpiresAt)}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Header with Navigation */}
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
        {/* Left: Lead Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Card */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <CardTitle className="text-2xl">{currentLead.customerName}</CardTitle>
                  <CardDescription>{currentLead.mobileNumber}</CardDescription>
                </div>
                {currentLead.priority && (
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded ${
                      currentLead.priority === "High"
                        ? "bg-red-100 text-red-700"
                        : currentLead.priority === "Low"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {currentLead.priority} Priority
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {currentLead.city && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">City</p>
                      <p className="font-medium">{currentLead.city}</p>
                    </div>
                  </div>
                )}
                {currentLead.interestedService && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Service</p>
                      <p className="font-medium">{currentLead.interestedService}</p>
                    </div>
                  </div>
                )}
              </div>

              {currentLead.remarks && (
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertDescription>
                    <p className="text-xs text-muted-foreground mb-1">Additional Notes</p>
                    <p className="text-sm">{currentLead.remarks}</p>
                  </AlertDescription>
                </Alert>
              )}

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

          {/* Call Form */}
          <Card>
            <CardHeader>
              <CardTitle>Call Details</CardTitle>
              <CardDescription>Update the call status and add notes</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Call Timer & Action */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  {isCallActive ? (
                    <div className="rounded-lg border-2 border-green-500 bg-green-50 p-6 flex flex-col items-center justify-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                        <p className="font-semibold text-green-700">Call Active</p>
                      </div>
                      <p className="text-3xl font-bold text-green-700">
                        {formatDuration(callDuration)}
                      </p>
                      <Button
                        variant="destructive"
                        onClick={handleCallEnd}
                        className="w-full"
                      >
                        End Call
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleCallStart}
                      className="w-full bg-gradient-accent text-white h-20 text-lg font-semibold gap-2"
                      disabled={lockStatus.isLocked && !lockStatus.isLockedByCurrentUser}
                    >
                      <Phone className="h-5 w-5" />
                      Call Now
                    </Button>
                  )}
                </div>
              </div>

              {/* Call Status */}
              <div className="space-y-2">
                <Label htmlFor="call-status" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Call Status *
                </Label>
                <Select
                  value={callStatus}
                  onValueChange={setCallStatus}
                  disabled={lockStatus.isLocked && !lockStatus.isLockedByCurrentUser}
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

              {/* Feedback Notes */}
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
                  disabled={lockStatus.isLocked && !lockStatus.isLockedByCurrentUser}
                />
              </div>

              {/* Follow-up Date */}
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
                  disabled={lockStatus.isLocked && !lockStatus.isLockedByCurrentUser}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => navigate({ to: "/my-leads" })}
                  disabled={saveMutation.isPending || escalateMutation.isPending}
                >
                  Cancel
                </Button>
                
                {/* Escalate to Senior Button - Only show when Interested */}
                {callStatus === "Interested" && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowEscalationDialog(true)}
                    disabled={escalateMutation.isPending || saveMutation.isPending}
                    className="gap-2"
                  >
                    <ArrowUp className="h-4 w-4" />
                    Escalate to Senior
                  </Button>
                )}
                
                <Button
                  onClick={handleSaveCall}
                  disabled={
                    saveMutation.isPending ||
                    !callStatus ||
                    (lockStatus.isLocked && !lockStatus.isLockedByCurrentUser)
                  }
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

        {/* Right: Queue Information */}
        <div className="space-y-4">
          {/* Progress */}
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

          {/* Upcoming Leads */}
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

      {/* Escalation Dialog */}
      <Dialog open={showEscalationDialog} onOpenChange={setShowEscalationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate to Senior Telecaller</DialogTitle>
            <DialogDescription>
              Send this lead to a senior telecaller for closing. They will be able to see all your notes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Select Senior */}
            <div className="space-y-2">
              <Label htmlFor="senior-select">Select Senior Telecaller *</Label>
              <Select value={selectedSenior} onValueChange={setSelectedSenior}>
                <SelectTrigger id="senior-select">
                  <SelectValue placeholder="Choose a senior..." />
                </SelectTrigger>
                <SelectContent>
                  {telecallers
                    .filter((tc) => tc.id !== user?.uid) // Don't show self
                    .map((tc) => (
                      <SelectItem key={tc.id} value={tc.id}>
                        {tc.fullName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Escalation Notes */}
            <div className="space-y-2">
              <Label htmlFor="esc-notes">Notes for Senior (Optional)</Label>
              <Textarea
                id="esc-notes"
                placeholder="Add any notes or context for the senior telecaller..."
                value={escalationNotes}
                onChange={(e) => setEscalationNotes(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEscalationDialog(false)}
              disabled={escalateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => escalateMutation.mutate()}
              disabled={!selectedSenior || escalateMutation.isPending}
              className="bg-gradient-accent text-white gap-2"
            >
              {escalateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Escalating...
                </>
              ) : (
                <>
                  <ArrowUp className="h-4 w-4" />
                  Escalate Lead
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
