import { createFileRoute } from "@tanstack/react-router";
import { Label } from "@/components/ui/label";
import { useState, useMemo, useRef, useEffect } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  writeBatch,
  limit,
  startAfter,
  serverTimestamp,
  getCountFromServer,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Users,
  Send,
  RotateCw,
  CheckCircle2,
  Loader2,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";

export const Route = createFileRoute("/_app/lead-assignment")({
  component: LeadAssignmentPage,
});

interface Lead {
  id: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  leadStatus: string;
  assignedTo?: string;
  assignedAt?: any;
  createdAt: any;
}

interface User {
  id: string;
  fullName: string;
  email: string;
}

const PAGE_SIZE = 50;

function LeadAssignmentPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isSelectAllMode, setIsSelectAllMode] = useState(false);
  
  const [bulkAssignDialog, setBulkAssignDialog] = useState(false);
  const [bulkAssignTo, setBulkAssignTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("Unassigned");
  const [customCount, setCustomCount] = useState("");
  
  const [showSmartDistribution, setShowSmartDistribution] = useState(false);
  const [selectedTelecallersForDistribution, setSelectedTelecallersForDistribution] = useState<Set<string>>(new Set());
  const [totalLeadsForDistribution, setTotalLeadsForDistribution] = useState<string>("");
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributionProgress, setDistributionProgress] = useState(0);

  // 1. Fetch leads count
  const { data: totalLeadsCount = 0 } = useQuery({
    queryKey: ["leads-count", statusFilter],
    queryFn: async () => {
      const queryStatus = statusFilter === "Incomplete" ? "Assigned" : statusFilter;
      const q = query(collection(db, "leads"), where("leadStatus", "==", queryStatus));
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    refetchOnWindowFocus: false,
  });

  // 2. Infinite Query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: leadsLoading,
  } = useInfiniteQuery({
    queryKey: ["leads-assignment-infinite", statusFilter],
    enabled: !!user,
    initialPageParam: undefined as any,
    queryFn: async ({ pageParam }) => {
      try {
        const queryStatus = statusFilter === "Incomplete" ? "Assigned" : statusFilter;
        let q = query(
          collection(db, "leads"),
          where("leadStatus", "==", queryStatus),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE)
        );
        if (pageParam) q = query(q, startAfter(pageParam));
        const snap = await getDocs(q);
        const leads = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          createdAt: d.data().createdAt?.toDate?.() || new Date(),
        })) as Lead[];
        return { leads, lastDoc: snap.docs[snap.docs.length - 1] || null };
      } catch (e: any) {
        toast.error("Firestore Index Required. Check console.");
        throw e;
      }
    },
    getNextPageParam: (lastPage) => lastPage.lastDoc || undefined,
  });

  // 4. Telecallers
  const { data: telecallers = [] } = useQuery({
    queryKey: ["telecallers"],
    enabled: !!user,
    queryFn: async () => {
      const q = query(collection(db, "users"), where("role", "==", "telecaller"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }) as User);
    },
  });

  const allLeads = useMemo(() => {
    const fetched = data?.pages.flatMap((page) => page.leads) ?? [];
    if (!searchQuery) return fetched;
    const s = searchQuery.toLowerCase();
    return fetched.filter(l => {
      const tcName = telecallers.find(t => t.id === l.assignedTo)?.fullName?.toLowerCase() || "";
      return l.customerName?.toLowerCase().includes(s) || 
             l.mobileNumber?.includes(s) ||
             tcName.includes(s);
    });
  }, [data, searchQuery, telecallers]);

  // 3. Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? allLeads.length + 1 : allLeads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  useEffect(() => {
    const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();
    if (lastItem && lastItem.index >= allLeads.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, allLeads.length, rowVirtualizer.getVirtualItems(), fetchNextPage]);

  const assignMutation = useMutation({
    mutationFn: async ({ leadId, telecallerId }: { leadId: string; telecallerId: string }) => {
      await updateDoc(doc(db, "leads", leadId), {
        assignedTo: telecallerId,
        assignedAt: serverTimestamp(),
        leadStatus: "Assigned",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads-assignment-infinite"] });
      qc.invalidateQueries({ queryKey: ["leads-count"] });
      toast.success("Assigned");
    },
  });

  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) newSelected.delete(leadId); else newSelected.add(leadId);
    setSelectedLeads(newSelected);
  };

  const handleSmartDistribution = async () => {
    const countToDistribute = parseInt(totalLeadsForDistribution) || 0;
    const selectedTeleIds = Array.from(selectedTelecallersForDistribution);
    if (countToDistribute <= 0 || selectedTeleIds.length === 0) { toast.error("Select count and team"); return; }
    setIsDistributing(true); setDistributionProgress(0);
    try {
      let processed = 0; let teleIndex = 0;
      while (processed < countToDistribute) {
        const currentBatchSize = Math.min(countToDistribute - processed, 500);
        const q = query(collection(db, "leads"), where("leadStatus", "==", "Unassigned"), orderBy("createdAt", "desc"), limit(currentBatchSize));
        const snap = await getDocs(q);
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach(d => {
          batch.update(doc(db, "leads", d.id), {
            assignedTo: selectedTeleIds[teleIndex % selectedTeleIds.length],
            assignedAt: serverTimestamp(),
            leadStatus: "Assigned",
          });
          teleIndex++;
        });
        await batch.commit();
        processed += snap.docs.length;
        setDistributionProgress(Math.round((processed / countToDistribute) * 100));
      }
      toast.success(`Distributed ${processed} leads!`);
      qc.invalidateQueries({ queryKey: ["leads-assignment-infinite"] });
      qc.invalidateQueries({ queryKey: ["leads-count"] });
      setShowSmartDistribution(false);
    } catch (e: any) { toast.error(e.message); } finally { setIsDistributing(false); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-full overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b sticky top-0 z-20">
        <div>
          <h2 className="text-lg font-bold leading-none">Assignment</h2>
          <p className="text-[10px] text-muted-foreground mt-1">Total: {totalLeadsCount}</p>
        </div>
        {selectedLeads.size > 0 && (
          <Button size="sm" onClick={() => setBulkAssignDialog(true)} className="h-8 text-xs bg-gradient-accent">
            <Send className="h-3 w-3 mr-1.5" /> Assign {selectedLeads.size}
          </Button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto bg-slate-50">
        <div className="p-3 space-y-3 max-w-5xl mx-auto">
          {/* Action Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Quick Select</span>
                {selectedLeads.size > 0 && <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-red-500" onClick={() => setSelectedLeads(new Set())}>Clear</Button>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["10", "20", "50"].map(n => (
                  <Button key={n} variant="outline" size="sm" className="h-7 text-[10px] px-3" onClick={() => setSelectedLeads(new Set(allLeads.slice(0, parseInt(n)).map(l => l.id)))}>Top {n}</Button>
                ))}
                <Input type="number" placeholder="Count..." className="h-7 w-20 text-[10px] ml-auto" value={customCount} onChange={e => setCustomCount(e.target.value)} />
                <Button size="sm" className="h-7 text-[10px]" onClick={() => setSelectedLeads(new Set(allLeads.slice(0, parseInt(customCount)).map(l => l.id)))}>Go</Button>
              </div>
            </div>

            <div className={`p-3 rounded-xl border shadow-sm transition-all ${showSmartDistribution ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-tighter">Smart Distribution</span>
                <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowSmartDistribution(!showSmartDistribution)}>{showSmartDistribution ? 'Close' : 'Configure'}</Button>
              </div>
              {showSmartDistribution && (
                <div className="mt-3 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                   <div className="flex flex-wrap gap-1">
                      {telecallers.map(tc => (
                        <Button key={tc.id} size="sm" variant={selectedTelecallersForDistribution.has(tc.id) ? "default" : "outline"} className={`h-6 text-[9px] px-2 ${selectedTelecallersForDistribution.has(tc.id) ? 'bg-indigo-600' : ''}`} onClick={() => { const n = new Set(selectedTelecallersForDistribution); if(n.has(tc.id)) n.delete(tc.id); else n.add(tc.id); setSelectedTelecallersForDistribution(n); }}>{tc.fullName}</Button>
                      ))}
                   </div>
                   <div className="flex gap-2">
                     <Input type="number" placeholder="Total leads..." className="h-8 text-xs flex-1" value={totalLeadsForDistribution} onChange={e => setTotalLeadsForDistribution(e.target.value)} />
                     <Button className="h-8 text-xs bg-indigo-600" disabled={isDistributing} onClick={handleSmartDistribution}>{isDistributing ? `${distributionProgress}%` : 'Start'}</Button>
                   </div>
                </div>
              )}
            </div>
          </div>

          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-9 p-1 bg-white border">
              <TabsTrigger value="Unassigned" className="text-[10px] h-7">Unassigned</TabsTrigger>
              <TabsTrigger value="Assigned" className="text-[10px] h-7">Assigned</TabsTrigger>
              <TabsTrigger value="In Progress" className="text-[10px] h-7">Progress</TabsTrigger>
              <TabsTrigger value="Incomplete" className="text-[10px] h-7">Incomplete Work</TabsTrigger>
            </TabsList>

            <TabsContent value={statusFilter} className="mt-3">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allLeads.length > 0 && selectedLeads.size === allLeads.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedLeads(new Set(allLeads.map(l => l.id)));
                        } else {
                          setSelectedLeads(new Set());
                        }
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-[10px] font-medium text-slate-600 hidden sm:inline">Select All</span>
                  </div>
                  <div className="relative flex-1 max-w-[200px]">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <Input placeholder="Search..." className="h-7 pl-7 text-[10px] border-none bg-transparent" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Selected: {selectedLeads.size}</div>
                </div>

                <div ref={parentRef} className="h-[450px] overflow-auto">
                  <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map((vRow) => {
                      const lead = allLeads[vRow.index];
                      if (!lead) return <div key={vRow.key} className="absolute top-0 left-0 w-full flex justify-center p-4" style={{ height: `${vRow.size}px`, transform: `translateY(${vRow.start}px)` }}><Loader2 className="h-4 w-4 animate-spin" /></div>;

                      return (
                        <div key={vRow.key} className={`absolute top-0 left-0 w-full border-b flex items-center px-3 transition-colors ${selectedLeads.has(lead.id) ? 'bg-blue-50' : ''}`} style={{ height: `${vRow.size}px`, transform: `translateY(${vRow.start}px)` }}>
                           <div className="flex items-center gap-3 w-full">
                              <Checkbox checked={selectedLeads.has(lead.id)} onCheckedChange={() => handleSelectLead(lead.id)} className="h-4 w-4" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-slate-900 truncate">{lead.customerName}</p>
                                  <p className="text-[9px] font-medium text-slate-400">{lead.mobileNumber}</p>
                                </div>
                                <div className="flex items-center justify-between mt-0.5">
                                  <p className="text-[10px] text-slate-500 truncate">{lead.city || 'No City'}</p>
                                  <div className="flex items-center gap-2">
                                     {lead.assignedTo ? (
                                       <span className="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-100">{telecallers.find(t => t.id === lead.assignedTo)?.fullName.split(' ')[0]}</span>
                                     ) : (
                                       <Select onValueChange={tid => assignMutation.mutate({ leadId: lead.id, telecallerId: tid })}>
                                         <SelectTrigger className="h-5 text-[8px] w-20 px-1.5 border-slate-300">
                                            <SelectValue placeholder="Assign" />
                                         </SelectTrigger>
                                         <SelectContent>
                                           {telecallers.map(t => <SelectItem key={t.id} value={t.id} className="text-[10px]">{t.fullName}</SelectItem>)}
                                         </SelectContent>
                                       </Select>
                                     )}
                                  </div>
                                </div>
                              </div>
                           </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={bulkAssignDialog} onOpenChange={setBulkAssignDialog}>
        <DialogContent className="max-w-[90vw] rounded-2xl">
          <DialogHeader><DialogTitle className="text-base">Batch Assign {selectedLeads.size} Leads</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <Select value={bulkAssignTo} onValueChange={setBulkAssignTo}>
              <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select Team Member" /></SelectTrigger>
              <SelectContent>{telecallers.map(tc => <SelectItem key={tc.id} value={tc.id}>{tc.fullName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter><Button className="w-full bg-blue-600" disabled={!bulkAssignTo} onClick={async () => { 
            setIsDistributing(true); 
            const ids = Array.from(selectedLeads);
            const batch = writeBatch(db);
            ids.forEach(id => batch.update(doc(db, "leads", id), { assignedTo: bulkAssignTo, assignedAt: serverTimestamp(), leadStatus: "Assigned" }));
            await batch.commit();
            qc.invalidateQueries({ queryKey: ["leads-assignment-infinite"] });
            setSelectedLeads(new Set());
            setIsDistributing(false);
            setBulkAssignTo("");
            setBulkAssignDialog(false);
            toast.success("Assigned Successfully");
          }}>Confirm Assignment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
