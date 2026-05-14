import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import {
  processLeadFile,
  generateSampleCSV,
  generateImportFileName,
  type ParsedLead,
} from "@/lib/csv-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropZone, CSVPreview, ImportSummary } from "@/components/csv-upload";
import { Download, CheckCircle2, AlertCircle, Loader2, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/import-leads")({
  component: ImportLeadsPage,
});

interface ImportBatch {
  id: string;
  fileName: string;
  uploadedAt: Date;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  status: string;
  // NEW: Daily batch fields
  dayIdentifier?: string;
  batchDate?: Date;
  batchStatus?: "active" | "completed" | "archived";
  assignedLeadsCount?: number;
  completedCallsCount?: number;
}

// Helper: Generate batch identifier with date
function generateBatchIdentifier(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `Batch_${year}-${month}-${day}`;
}

// Helper: Get today's date at midnight
function getTodayDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function ImportLeadsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "importing" | "summary">(
    "upload",
  );
  const [importSummary, setImportSummary] = useState<{
    successful: number;
    failed: number;
    duplicates: number;
  } | null>(null);
  const [showBatchDialog, setShowBatchDialog] = useState(false);

  // Fetch import history
  const { data: importHistory = [] } = useQuery({
    queryKey: ["import-batches"],
    enabled: !!user,
    queryFn: async () => {
      const q = query(collection(db, "leadImportBatches"));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as any),
          uploadedAt: d.data().uploadedAt?.toDate?.() || new Date(),
        }))
        .filter(b => b.uploadedBy === user?.uid)
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()) as ImportBatch[];
    },
  });

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setImportStep("preview");

    // Parse the file
    const result = await processLeadFile(file);

    if (result.success) {
      setParsedLeads(result.leads);
      setParseErrors(result.errors);
      setParseWarnings(result.warnings);
    } else {
      toast.error("Failed to parse file");
      setParseErrors(result.errors);
      setImportStep("upload");
    }
  };

  const importMutation = useMutation({
    mutationFn: async (leads: ParsedLead[]) => {
      if (!user || !selectedFile) throw new Error("Missing context");

      // Generate daily batch identifier
      const dayIdentifier = generateBatchIdentifier();
      const batchDate = getTodayDate();

      // Create import batch document with daily batch fields
      const batchRef = await addDoc(collection(db, "leadImportBatches"), {
        fileName: selectedFile.name,
        uploadedBy: user.uid,
        uploadedAt: serverTimestamp(),
        totalRows: leads.length,
        importedRows: leads.length,
        duplicateRows: parseWarnings.filter((w) => w.includes("Duplicate")).length,
        failedRows: parseErrors.length,
        status: "processing",
        // NEW: Daily batch fields
        dayIdentifier: dayIdentifier,
        batchDate: batchDate,
        batchStatus: "active",
        assignedLeadsCount: 0, // Will update when leads are assigned
        completedCallsCount: 0, // Will track when calls are made
        summary: {
          successful: leads.length,
          failed: parseErrors.length,
          duplicates: parseWarnings.filter((w) => w.includes("Duplicate")).length,
        },
      });

      // Batch write leads (strip undefined fields — Firestore rejects them)
      const batch = writeBatch(db);
      leads.forEach((lead) => {
        const leadRef = doc(collection(db, "leads"));
        const leadData: Record<string, any> = {
          leadStatus: "Unassigned",
          uploadBatchId: batchRef.id,
          uploadSource: "csv_import",
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        };
        // Only include defined fields from the parsed lead
        (Object.keys(lead) as (keyof typeof lead)[]).forEach((key) => {
          if (lead[key] !== undefined) {
            leadData[key] = lead[key];
          }
        });
        batch.set(leadRef, leadData);
      });

      await batch.commit();

      // Update batch status
      await updateBatchStatus(batchRef.id, "completed");

      return {
        successful: leads.length,
        failed: parseErrors.length,
        duplicates: parseWarnings.filter((w) => w.includes("Duplicate")).length,
      };
    },
    onSuccess: (summary) => {
      setImportSummary(summary);
      setImportStep("summary");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["import-batches"] });
      toast.success("Leads imported successfully!");
    },
    onError: (err: any) => {
      toast.error(`Import failed: ${err.message}`);
      setImportStep("preview");
    },
  });

  const undoBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      // Step 1: Get the batch to check status
      const batchDoc = await getDocs(query(collection(db, "leadImportBatches"), where("__name__", "==", batchId)));
      if (batchDoc.empty) throw new Error("Batch not found");
      const batchData = batchDoc.docs[0].data();

      // Step 2: Fetch all leads that belong to this batch
      const leadsQuery = query(collection(db, "leads"), where("uploadBatchId", "==", batchId));
      const leadsSnapshot = await getDocs(leadsQuery);

      // Step 3: Check for assigned leads and calls
      const assignedLeads: string[] = [];
      const leadsWithCalls: string[] = [];
      const leadsToDelete: string[] = [];

      for (const leadDoc of leadsSnapshot.docs) {
        const leadData = leadDoc.data();
        const leadId = leadDoc.id;

        // Check if lead is assigned
        if (leadData.assignedTo) {
          assignedLeads.push(leadId);
        }

        // Check if lead has any calls
        const callsQuery = query(collection(db, "calls"), where("leadId", "==", leadId));
        const callsSnapshot = await getDocs(callsQuery);
        if (callsSnapshot.size > 0) {
          leadsWithCalls.push(leadId);
        }

        // Mark for deletion only if unassigned and no calls
        if (!leadData.assignedTo && callsSnapshot.size === 0) {
          leadsToDelete.push(leadId);
        }
      }

      // Step 4: If there are assigned leads or calls, throw error with details
      if (assignedLeads.length > 0 || leadsWithCalls.length > 0) {
        const errorMsg = `Cannot delete batch: ${assignedLeads.length} assigned leads, ${leadsWithCalls.length} leads with calls. Please reassign leads first.`;
        throw new Error(errorMsg);
      }

      // Step 5: Delete only unassigned leads with no calls
      if (leadsToDelete.length > 0) {
        const batches = [];
        let currentBatch = writeBatch(db);
        let count = 0;

        for (const leadId of leadsToDelete) {
          currentBatch.delete(doc(db, "leads", leadId));
          count++;
          if (count === 500) {
            batches.push(currentBatch.commit());
            currentBatch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) {
          batches.push(currentBatch.commit());
        }
        await Promise.all(batches);
      }

      // Step 6: Archive the batch instead of deleting (for safety)
      await updateDoc(doc(db, "leadImportBatches", batchId), {
        batchStatus: "archived",
        status: "archived",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["import-batches"] });
      toast.success("Batch archived successfully");
    },
    onError: (err: any) => {
      toast.error(`Failed to delete batch: ${err.message}`);
    },
  });

  const handleImport = () => {
    setImportStep("importing");
    importMutation.mutate(parsedLeads);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParsedLeads([]);
    setParseErrors([]);
    setParseWarnings([]);
    setImportStep("upload");
    setImportSummary(null);
  };

  const downloadSample = () => {
    const csv = generateSampleCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_leads.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Sample CSV downloaded");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Import Leads</h2>
        <p className="text-muted-foreground mt-1">
          Bulk upload customer leads from CSV files for automatic distribution to telecallers
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main import panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upload Step */}
          {importStep === "upload" && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle>Upload CSV File</CardTitle>
                <CardDescription>
                  Select a CSV file containing your customer leads
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DropZone onFileSelect={handleFileSelect} />

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    CSV must contain columns: customer_name, mobile_number. Optional: city
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* Preview Step */}
          {importStep === "preview" && (
            <Card>
              <CardHeader>
                <CardTitle>Preview & Confirm</CardTitle>
                <CardDescription>
                  Review the data before importing. Invalid rows will be skipped.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <CSVPreview leads={parsedLeads} />

                <ImportSummary
                  total={parsedLeads.length + parseErrors.length}
                  successful={parsedLeads.length}
                  failed={parseErrors.length}
                  duplicates={parseWarnings.filter((w) => w.includes("Duplicate")).length}
                  errors={parseErrors}
                  warnings={parseWarnings}
                />

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" onClick={handleReset} disabled={importMutation.isPending}>
                    Back
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={parsedLeads.length === 0 || importMutation.isPending}
                    className="bg-gradient-accent text-white"
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      "Import Leads"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Importing Step */}
          {importStep === "importing" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                <p className="font-semibold">Importing leads...</p>
                <p className="text-sm text-muted-foreground">
                  This may take a moment. Please don't close this window.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Summary Step */}
          {importStep === "summary" && importSummary && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  Import Successful
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-xs text-muted-foreground mb-1">Imported</p>
                    <p className="text-2xl font-bold text-green-700">{importSummary.successful}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-xs text-muted-foreground mb-1">Duplicates</p>
                    <p className="text-2xl font-bold text-yellow-700">{importSummary.duplicates}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-xs text-muted-foreground mb-1">Failed</p>
                    <p className="text-2xl font-bold text-red-700">{importSummary.failed}</p>
                  </div>
                </div>

                <Alert className="bg-white border-green-200">
                  <AlertCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">
                    ✓ Leads have been imported successfully and are now available for assignment to
                    telecallers.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleReset}>
                    Import More
                  </Button>
                  <Button className="bg-gradient-accent text-white" asChild>
                    <a href="/lead-assignment">Manage Leads</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={downloadSample}
              >
                <Download className="h-4 w-4 mr-2" />
                Sample CSV
              </Button>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">CSV Format</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>
                <p className="font-semibold text-xs text-muted-foreground mb-2">Required Fields:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <code className="bg-muted px-1 rounded">customer_name</code></li>
                  <li>• <code className="bg-muted px-1 rounded">mobile_number</code></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-xs text-muted-foreground mb-2">Optional Fields:</p>
                <ul className="space-y-1 text-xs">
                  <li>• <code className="bg-muted px-1 rounded">city</code></li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Import History */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Imports</CardTitle>
                <button
                  onClick={() => setShowBatchDialog(true)}
                  className="text-xs text-primary hover:underline"
                >
                  View All
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {importHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">No imports yet</p>
              ) : (
                importHistory.slice(0, 3).map((batch) => (
                  <div
                    key={batch.id}
                    className="rounded-lg border p-3 hover:bg-muted/50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs font-semibold truncate">{batch.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {batch.importedRows} leads • {batch.uploadedAt.toLocaleDateString()}
                        </p>
                        {batch.dayIdentifier && (
                          <p className="text-xs text-blue-600 font-medium">{batch.dayIdentifier}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {batch.batchStatus === "active" && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                        {batch.batchStatus === "completed" && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Completed
                          </span>
                        )}
                        {batch.batchStatus === "archived" && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Archived
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Batch History Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import History</DialogTitle>
            <DialogDescription>View all previous lead imports</DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead className="text-right">Imported</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importHistory.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="text-xs font-medium text-blue-600">
                      {batch.dayIdentifier || "N/A"}
                    </TableCell>
                    <TableCell className="text-sm font-medium truncate max-w-xs">
                      {batch.fileName}
                    </TableCell>
                    <TableCell className="text-right text-green-700 font-semibold">
                      {batch.importedRows}
                    </TableCell>
                    <TableCell className="text-right text-blue-700">
                      {batch.assignedLeadsCount || 0}
                    </TableCell>
                    <TableCell>
                      {batch.batchStatus === "active" && (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      )}
                      {batch.batchStatus === "completed" && (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Completed
                        </span>
                      )}
                      {batch.batchStatus === "archived" && (
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Archived
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive/90 hover:bg-destructive/10 px-2"
                        disabled={undoBatchMutation.isPending}
                        onClick={() => {
                          const assignedCount = batch.assignedLeadsCount || 0;
                          const callsCount = batch.completedCallsCount || 0;
                          
                          if (assignedCount > 0 || callsCount > 0) {
                            confirm(`⚠️ Warning!\n\nThis batch has:\n- ${assignedCount} assigned leads\n- ${callsCount} completed calls\n\nThese cannot be deleted. Please reassign leads first.`);
                            return;
                          }
                          
                          if (confirm("Are you sure you want to archive this batch? Only unassigned leads will be deleted.")) {
                            undoBatchMutation.mutate(batch.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function updateBatchStatus(batchId: string, status: string) {
  return new Promise((resolve) => setTimeout(resolve, 100));
}
