import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc, 
  writeBatch,
  orderBy,
  limit,
  startAfter,
  getCountFromServer,
  serverTimestamp,
  increment
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/hooks/useAuth";
import { leadService } from "@/services/leadService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { LEAD_STATUSES, statusBadgeClass } from "@/lib/lead-utils";
import { 
  Plus, Search, Phone, MessageCircle, Trash2, Loader2, Inbox, 
  CheckCircle2, Filter, AlertTriangle, ShieldAlert, FolderArchive, 
  Calendar, FileText, ChevronRight, Layers, ArrowLeft, MoreVertical,
  History
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useVirtualizer } from "@tanstack/react-virtual";

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
  createdAt: any;
  createdBy: string;
  uploadBatchId?: string;
  escalationStatus?: "none" | "pending_senior" | "closed_by_senior";
};

interface ImportBatch {
  id: string;
  fileName: string;
  uploadedAt: any;
  importedRows: number;
  batchStatus?: "active" | "completed" | "archived";
}

const PAGE_SIZE = 50;

function LeadsPage() {
  const { role, user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const parentRef = useRef<HTMLDivElement>(null);
  
  // VIEW MODE: 'batches' or 'leads'
  const [viewMode, setViewMode] = useState<'batches' | 'leads'>('batches');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [telecallerFilter, setTelecallerFilter] = useState<string>("all");
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNuclearOpen, setIsNuclearOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  // 1. Fetch Batches
  const { data: batches = [], isLoading: batchesLoading } = useQuery({
    queryKey: ["import-batches-list"],
    queryFn: async () => {
      const q = query(collection(db, "leadImportBatches"));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            uploadedAt: data.uploadedAt?.toDate?.() || new Date()
          } as ImportBatch;
        })
        .filter(b => b.batchStatus !== "archived")
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
    }
  });

  // 2. Fetch Telecallers
  const { data: telecallers = [] } = useQuery({
    queryKey: ["telecallers-lookup"],
    queryFn: async () => {
      const q = query(collection(db, "users"), where("role", "==", "telecaller"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, fullName: d.data().fullName })) as any[];
    }
  });

  // 3. Total Count (Scoped to Batch if selected)
  const { data: totalLeadsCount = 0 } = useQuery({
    queryKey: ["leads-total-count", selectedBatchId, statusFilter, telecallerFilter],
    queryFn: async () => {
      let q = query(collection(db, "leads"));
      if (selectedBatchId) q = query(q, where("uploadBatchId", "==", selectedBatchId));
      if (statusFilter !== "all") q = query(q, where("leadStatus", "==", statusFilter));
      if (telecallerFilter !== "all") q = query(q, where("assignedTo", "==", telecallerFilter));
      const snap = await getCountFromServer(q);
      return snap.data().count;
    }
  });

  // 4. Infinite Query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: leadsLoading,
  } = useInfiniteQuery({
    queryKey: ["leads-infinite", selectedBatchId, statusFilter, telecallerFilter],
    initialPageParam: undefined as any,
    enabled: viewMode === 'leads',
    queryFn: async ({ pageParam }) => {
      let q = query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
      if (selectedBatchId) q = query(q, where("uploadBatchId", "==", selectedBatchId));
      if (statusFilter !== "all") q = query(q, where("leadStatus", "==", statusFilter));
      if (telecallerFilter !== "all") q = query(q, where("assignedTo", "==", telecallerFilter));
      if (pageParam) q = query(q, startAfter(pageParam));
      const snap = await getDocs(q);
      return {
        leads: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || new Date() })) as Lead[],
        lastDoc: snap.docs[snap.docs.length - 1] || null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.lastDoc || undefined,
  });

  const allLeads = useMemo(() => {
    const fetched = data?.pages.flatMap((page) => page.leads) ?? [];
    if (!searchQuery) return fetched;
    const s = searchQuery.toLowerCase();
    return fetched.filter(l => l.customerName?.toLowerCase().includes(s) || l.mobileNumber?.includes(s) || l.city?.toLowerCase().includes(s));
  }, [data, searchQuery]);

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? allLeads.length + 1 : allLeads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 85,
    overscan: 10,
  });

  useEffect(() => {
    const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();
    if (lastItem && lastItem.index >= allLeads.length - 1 && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, allLeads.length, rowVirtualizer.getVirtualItems(), fetchNextPage]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (form: Partial<Lead>) => {
      const docRef = doc(collection(db, "leads"));
      await setDoc(docRef, { 
        ...form, 
        createdBy: user?.uid, 
        createdAt: serverTimestamp(),
        leadStatus: form.leadStatus || "New Lead"
      });
      // Increment count
      await updateDoc(doc(db, "stats", "global"), {
        totalLeads: increment(1),
        unassignedLeads: increment(1),
        lastUpdated: serverTimestamp()
      });
    },
    onSuccess: () => {
      toast.success("Lead created");
      qc.invalidateQueries({ queryKey: ["leads-infinite"] });
      qc.invalidateQueries({ queryKey: ["leads-total-count"] });
      setIsDialogOpen(false);
    },
  });

  const bulkDel = useMutation({
    mutationFn: async (ids: string[]) => {
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, "leads", id)));
      await batch.commit();
    },
    onSuccess: () => {
      toast.success(`Deleted ${selectedLeads.size} leads`);
      setSelectedLeads(new Set());
      qc.invalidateQueries({ queryKey: ["leads-infinite"] });
      qc.invalidateQueries({ queryKey: ["leads-total-count"] });
    },
  });

  const nuclearDelete = useMutation({
    mutationFn: async () => {
      if (selectedBatchId) {
        // Delete specific batch
        const q = query(collection(db, "leads"), where("uploadBatchId", "==", selectedBatchId));
        const snap = await getDocs(q);
        
        let batch = writeBatch(db);
        let count = 0;
        for (const d of snap.docs) {
          batch.delete(d.ref);
          count++;
          if (count === 500) { await batch.commit(); batch = writeBatch(db); count = 0; }
        }
        if (count > 0) await batch.commit();

        // Mark batch as archived
        await updateDoc(doc(db, "leadImportBatches", selectedBatchId), { batchStatus: "archived" });
      } else {
        // Delete All
        await leadService.deleteAllLeads();
      }
    },
    onSuccess: () => {
      toast.success("Wiped successfully");
      qc.invalidateQueries();
      setIsNuclearOpen(false);
      setViewMode('batches');
      setSelectedBatchId(null);
    }
  });

  const currentBatch = batches.find(b => b.id === selectedBatchId);

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-full overflow-hidden bg-slate-50">
      {/* HEADER */}
      <div className="bg-white border-b sticky top-0 z-20 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {viewMode === 'leads' && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setViewMode('batches'); setSelectedBatchId(null); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 leading-none">
              {viewMode === 'batches' ? 'Import Batches' : (currentBatch ? `Batch_${currentBatch.uploadedAt.toLocaleDateString().replace(/\//g, '-')}` : 'Master List')}
            </h2>
            <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-widest">
              {viewMode === 'batches' ? `${batches.length} Files Uploaded` : `Leads: ${totalLeadsCount}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {viewMode === 'batches' && (
            <Button variant="outline" size="sm" className="h-8 text-[10px]" asChild>
              <Link to="/import-leads"><Plus className="h-3 w-3 mr-1" /> Import CSV</Link>
            </Button>
          )}
          {viewMode === 'leads' && (
            <>
              {isAdmin && (
                <Button variant="outline" size="sm" className="h-8 px-3 text-[10px] border-red-100 text-red-500 hover:bg-red-50" onClick={() => setIsNuclearOpen(true)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Wipe Batch
                </Button>
              )}
              <Button size="sm" className="h-8 px-3 text-[10px] bg-gradient-accent text-white" onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Quick Lead
              </Button>
            </>
          )}
        </div>
      </div>

      {/* SEARCH & FILTERS (Only in Leads mode) */}
      {viewMode === 'leads' && (
        <div className="p-3 bg-white border-b space-y-2 animate-in slide-in-from-top duration-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input className="h-8 pl-9 text-xs bg-slate-50 border-none rounded-lg" placeholder="Search in this batch..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 text-[10px] flex-1 min-w-[100px] bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[10px]">All Status</SelectItem>
                {LEAD_STATUSES.map(s => <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={telecallerFilter} onValueChange={setTelecallerFilter}>
              <SelectTrigger className="h-7 text-[10px] flex-1 min-w-[100px] bg-white"><SelectValue placeholder="Telecaller" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[10px]">Everyone</SelectItem>
                {telecallers.map(tc => <SelectItem key={tc.id} value={tc.id} className="text-[10px]">{tc.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-7 text-[9px] font-bold uppercase text-slate-400 hover:text-red-500" onClick={() => { setStatusFilter("all"); setTelecallerFilter("all"); setSearchQuery(""); }}>
              Reset Filters
            </Button>
          </div>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-auto bg-slate-50">
        {viewMode === 'batches' ? (
          /* BATCH LIST VIEW */
          <div className="max-w-4xl mx-auto p-6 space-y-3">
             {/* Master List Row */}
             <div 
               className="bg-white border rounded-lg p-4 flex items-center justify-between hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer transition-all group"
               onClick={() => { setViewMode('leads'); setSelectedBatchId(null); }}
             >
               <div className="flex items-center gap-4">
                 <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                   <Layers className="h-5 w-5" />
                 </div>
                 <div>
                   <h3 className="text-sm font-bold text-slate-900">Master List (All Contacts)</h3>
                   <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Complete database overview</p>
                 </div>
               </div>
               <ChevronRight className="h-5 w-5 text-slate-200 group-hover:text-blue-500 transition-all" />
             </div>

             <div className="pt-4 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
               <History className="h-3 w-3" /> Import History
             </div>

             {batchesLoading ? (
               Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-white border rounded-lg animate-pulse" />)
             ) : batches.length === 0 ? (
               <div className="py-20 text-center">
                 <Inbox className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                 <p className="text-sm text-slate-400 font-medium">No import batches found.</p>
               </div>
             ) : (
               batches.map((batch) => {
                 const batchName = `Batch_${batch.uploadedAt.toLocaleDateString().replace(/\//g, '-')}`;
                 return (
                   <div 
                     key={batch.id} 
                     className="bg-white border rounded-lg p-4 flex items-center justify-between hover:border-blue-200 hover:shadow-sm cursor-pointer transition-all group relative"
                     onClick={() => { setSelectedBatchId(batch.id); setViewMode('leads'); }}
                   >
                     <div className="flex items-center gap-4">
                       <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                         <FileText className="h-5 w-5" />
                       </div>
                       <div>
                         <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{batchName}</h3>
                         <div className="flex items-center gap-3 mt-0.5">
                           <p className="text-[10px] text-slate-500 font-medium">{batch.fileName}</p>
                           <span className="text-[10px] text-slate-300">•</span>
                           <p className="text-[10px] text-blue-600 font-bold">{batch.importedRows} Contacts</p>
                         </div>
                       </div>
                     </div>
                     
                     <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                       {isAdmin && (
                         <Button 
                           variant="ghost" 
                           size="sm" 
                           className="h-9 w-9 p-0 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                           onClick={() => { setSelectedBatchId(batch.id); setIsNuclearOpen(true); }}
                           title="Delete Batch"
                         >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       )}
                       <div className="h-9 w-9 flex items-center justify-center text-slate-200 group-hover:text-blue-500 transition-all">
                         <ChevronRight className="h-5 w-5" />
                       </div>
                     </div>
                   </div>
                 );
               })
             )}
          </div>
        ) : (
          /* LEADS EXPLORER (VIRTUALIZED) */
          <div ref={parentRef} className="h-full bg-white relative overflow-auto border-t">
             {leadsLoading ? (
               <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Opening Folder...</p></div>
             ) : allLeads.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                 <div className="bg-slate-50 p-4 rounded-full"><Inbox className="h-8 w-8 text-slate-300" /></div>
                 <div><h3 className="font-bold text-slate-400">Empty Batch</h3><p className="text-[10px] text-slate-400 uppercase">Try clearing filters or check the import source</p></div>
               </div>
             ) : (
               <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                 {rowVirtualizer.getVirtualItems().map((vRow) => {
                   const lead = allLeads[vRow.index];
                   if (!lead) return <div key={vRow.key} className="absolute top-0 left-0 w-full flex items-center justify-center p-4" style={{ height: `${vRow.size}px`, transform: `translateY(${vRow.start}px)` }}><Loader2 className="h-4 w-4 animate-spin text-slate-200" /></div>;
                   const assignedName = telecallers.find(t => t.id === lead.assignedTo)?.fullName || 'Assigned';

                   return (
                     <div key={vRow.key} className={`absolute top-0 left-0 w-full border-b flex items-center px-4 transition-colors ${selectedLeads.has(lead.id) ? 'bg-blue-50/50' : 'bg-white hover:bg-slate-50'}`} style={{ height: `${vRow.size}px`, transform: `translateY(${vRow.start}px)` }}>
                       <div className="flex items-center gap-3 w-full">
                         <Checkbox checked={selectedLeads.has(lead.id)} onCheckedChange={() => { const n = new Set(selectedLeads); if(n.has(lead.id)) n.delete(lead.id); else n.add(lead.id); setSelectedLeads(n); }} className="h-4 w-4" />
                         <div className="flex-1 min-w-0 py-2">
                           <div className="flex items-center justify-between">
                             <p className="text-xs font-bold text-slate-900 truncate">{lead.customerName}</p>
                             <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border leading-none ${statusBadgeClass(lead.leadStatus)}`}>{lead.leadStatus}</span>
                           </div>
                           <div className="flex items-center justify-between mt-1">
                             <p className="text-[10px] text-slate-500 font-medium truncate">{lead.mobileNumber} • {lead.city || '—'}</p>
                             <div className="flex items-center gap-2">
                               <p className={`text-[9px] font-bold ${lead.assignedTo ? 'text-blue-600' : 'text-slate-400 italic'}`}>{lead.assignedTo ? `Assigned: ${assignedName}` : 'Not Assigned'}</p>
                               <div className="flex items-center gap-1.5 ml-2">
                                 <a href={`tel:${lead.mobileNumber}`} className="h-7 w-7 flex items-center justify-center rounded-full bg-blue-50 text-blue-600 border border-blue-100"><Phone className="h-3 w-3" /></a>
                                 <a href={`https://wa.me/${lead.mobileNumber.replace(/\D/g, "")}`} target="_blank" className="h-7 w-7 flex items-center justify-center rounded-full bg-green-50 text-green-600 border border-green-100"><MessageCircle className="h-3.5 w-3.5" /></a>
                                 {role === "admin" && <button className="h-7 w-7 flex items-center justify-center rounded-full bg-red-50 text-red-300 border border-red-100" onClick={() => confirm("Delete lead?") && bulkDel.mutate([lead.id])}><Trash2 className="h-3 w-3" /></button>}
                               </div>
                             </div>
                           </div>
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
             )}
          </div>
        )}
      </div>

      {/* FOOTER STATS */}
      <div className="px-4 py-2 bg-white border-t flex justify-between items-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
         <span>{isFetchingNextPage ? 'Syncing...' : 'Ready'} • {viewMode === 'batches' ? `${batches.length} Batches` : `${allLeads.length} Leads`}</span>
         {isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>

      {/* QUICK LEAD DIALOG */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl p-4 gap-4">
          <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">Quick Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
             <div className="grid grid-cols-2 gap-2">
               <div className="space-y-1"><Label className="text-[9px] uppercase font-bold text-slate-500">Name</Label><Input id="new-name" placeholder="Full Name" className="h-8 text-xs" /></div>
               <div className="space-y-1"><Label className="text-[9px] uppercase font-bold text-slate-500">Mobile</Label><Input id="new-mobile" placeholder="Phone Number" className="h-8 text-xs" /></div>
             </div>
             <div className="space-y-1"><Label className="text-[9px] uppercase font-bold text-slate-500">Notes</Label><Textarea id="new-notes" className="text-xs min-h-[60px]" placeholder="Add comments..." /></div>
          </div>
          <DialogFooter><Button className="w-full bg-blue-600 h-9 text-xs font-bold uppercase tracking-wider text-white" onClick={() => {
            const name = (document.getElementById('new-name') as HTMLInputElement)?.value;
            const mobile = (document.getElementById('new-mobile') as HTMLInputElement)?.value;
            if(!name || !mobile) { toast.error("Name and Mobile required"); return; }
            createMutation.mutate({ customerName: name, mobileNumber: mobile, leadStatus: 'New Lead', uploadBatchId: selectedBatchId || undefined });
          }}>Save to {selectedBatchId ? 'this Batch' : 'Master List'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NUCLEAR WIPE DIALOG */}
      <Dialog open={isNuclearOpen} onOpenChange={setIsNuclearOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md rounded-2xl p-6 gap-6 text-center">
          <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto"><ShieldAlert className="h-6 w-6 text-red-600" /></div>
          <DialogHeader><DialogTitle className="text-lg font-bold text-red-600 uppercase">Wipe Batch?</DialogTitle><DialogDescription className="text-xs">This will permanently delete ALL leads in this specific batch. This cannot be undone.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg"><p className="text-[10px] text-red-700 font-bold uppercase">To confirm, type <b>DELETE BATCH</b></p></div>
            <Input className="h-10 text-center font-bold tracking-widest uppercase border-red-200" placeholder="..." value={confirmText} onChange={e => setConfirmText(e.target.value)} />
          </div>
          <DialogFooter className="flex flex-col gap-2">
            <Button className="w-full bg-red-600 text-white font-bold h-10" disabled={confirmText !== "DELETE BATCH"} onClick={() => nuclearDelete.mutate()}>Wipe Folder</Button>
            <Button variant="ghost" className="w-full text-slate-400 font-bold" onClick={() => { setIsNuclearOpen(false); setConfirmText(""); }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
