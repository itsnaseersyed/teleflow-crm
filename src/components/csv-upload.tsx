import React, { useState, useCallback } from "react";
import { Upload, X, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  maxSizeMB?: number;
}

export function DropZone({
  onFileSelect,
  accept = ".csv,.xlsx,.xls",
  disabled = false,
  maxSizeMB = 10,
}: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    const acceptedTypes = accept.split(",").map((t) => t.trim());
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();

    if (!acceptedTypes.includes(fileExt)) {
      setError(
        `Invalid file type. Accepted: ${accept}`,
      );
      return false;
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      setError(
        `File size exceeds ${maxSizeMB}MB limit. Your file: ${sizeMB.toFixed(2)}MB`,
      );
      return false;
    }

    setError(null);
    return true;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragActive(e.type === "dragenter" || e.type === "dragover");
    }
  }, [disabled]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0 && validateFile(files[0])) {
        onFileSelect(files[0]);
      }
    },
    [disabled, onFileSelect],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0] && validateFile(e.target.files[0])) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-lg border-2 border-dashed transition-colors",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/30 hover:bg-muted/50",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        className="absolute inset-0 cursor-pointer opacity-0"
      />

      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="rounded-full bg-primary/10 p-3 mb-3">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <p className="font-semibold text-sm mb-1">Drag and drop your file here</p>
        <p className="text-xs text-muted-foreground mb-4">
          or click to browse from your computer
        </p>
        <p className="text-xs text-muted-foreground">
          Supported: CSV, XLSX (Max {maxSizeMB}MB)
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="rounded-lg m-4 mt-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

interface CSVPreviewProps {
  leads: Array<Record<string, any>>;
  onClear?: () => void;
  maxRows?: number;
}

export function CSVPreview({
  leads,
  onClear,
  maxRows = 10,
}: CSVPreviewProps) {
  const displayLeads = leads.slice(0, maxRows);
  const hiddenLeads = Math.max(0, leads.length - maxRows);

  if (leads.length === 0) {
    return (
      <Alert className="bg-blue-50 border-blue-200">
        <FileText className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          No leads to preview
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Showing {displayLeads.length} of {leads.length} leads
          </p>
        </div>
        {onClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs">#</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Name</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Phone</th>
              <th className="px-3 py-2 text-left font-medium text-xs">City</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayLeads.map((lead, idx) => (
              <tr key={idx} className="hover:bg-muted/50">
                <td className="px-3 py-2 text-xs font-medium">{idx + 1}</td>
                <td className="px-3 py-2 text-xs">{lead.customerName}</td>
                <td className="px-3 py-2 text-xs">{lead.mobileNumber}</td>
                <td className="px-3 py-2 text-xs">{lead.city || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hiddenLeads > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          ... and {hiddenLeads} more leads
        </p>
      )}
    </div>
  );
}

interface ImportSummaryProps {
  total: number;
  successful: number;
  failed: number;
  duplicates: number;
  warnings?: string[];
  errors?: string[];
}

export function ImportSummary({
  total,
  successful,
  failed,
  duplicates,
  warnings = [],
  errors = [],
}: ImportSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Total Rows</p>
          <p className="text-lg font-semibold">{total}</p>
        </div>
        <div className="rounded-lg border p-3 bg-green-50">
          <p className="text-xs text-green-700 mb-1">Imported</p>
          <p className="text-lg font-semibold text-green-700">{successful}</p>
        </div>
        <div className="rounded-lg border p-3 bg-yellow-50">
          <p className="text-xs text-yellow-700 mb-1">Duplicates</p>
          <p className="text-lg font-semibold text-yellow-700">{duplicates}</p>
        </div>
        <div className="rounded-lg border p-3 bg-red-50">
          <p className="text-xs text-red-700 mb-1">Failed</p>
          <p className="text-lg font-semibold text-red-700">{failed}</p>
        </div>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-semibold text-sm">Errors ({errors.length}):</p>
              <ul className="text-xs space-y-1">
                {errors.slice(0, 5).map((error, idx) => (
                  <li key={idx}>• {error}</li>
                ))}
                {errors.length > 5 && (
                  <li>• ... and {errors.length - 5} more errors</li>
                )}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-semibold text-sm">Warnings ({warnings.length}):</p>
              <ul className="text-xs space-y-1">
                {warnings.slice(0, 5).map((warning, idx) => (
                  <li key={idx}>• {warning}</li>
                ))}
                {warnings.length > 5 && (
                  <li>• ... and {warnings.length - 5} more warnings</li>
                )}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
