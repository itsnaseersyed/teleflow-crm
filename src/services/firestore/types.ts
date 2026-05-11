// Auto-generated type definitions for Firestore collections

export interface User {
  uid: string;
  email: string;
  fullName: string;
  phone?: string;
  profileImage?: string;
  isActive: boolean;
  role: "admin" | "telecaller";
  createdAt: Date;
  deletedAt?: Date;
  deletedBy?: string;
  deletedByName?: string;
  password?: string | null;
}

export interface Lead {
  id: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  interestedService?: string;
  priority?: "High" | "Medium" | "Low";
  remarks?: string;
  leadStatus: "Unassigned" | "Assigned" | "In Progress" | "Completed" | "Follow-Up" | "Converted" | "Not Interested";
  assignedTo?: string; // uid of telecaller
  assignedAt?: Date;
  queuePosition?: number;
  uploadBatchId?: string; // Reference to import batch
  uploadSource?: string;
  lastCallStatus?: "Interested" | "Follow-Up Needed" | "Not Interested" | "Busy" | "No Response" | "Switched Off" | "Converted" | "Invalid Number";
  lastCalledAt?: Date;
  completedStatus?: boolean;
  feedbackNotes?: string;
  followUpDate?: Date | string;
  createdBy: string; // uid of admin who created/added
  createdAt: Date;
  
  // Lead locking system
  isLocked?: boolean;
  lockedBy?: string; // uid of telecaller who locked
  lockedByName?: string; // Name of telecaller who locked
  lockedAt?: Date;
  lockExpiresAt?: Date;
}

export interface LeadImportBatch {
  id: string;
  fileName: string;
  uploadedBy: string; // admin uid
  uploadedAt: Date;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage?: string;
  summary: {
    successful: number;
    failed: number;
    duplicates: number;
  };
}

export interface Call {
  id: string;
  leadId: string;
  telecallerId: string;
  customerName: string;
  mobileNumber: string;
  city?: string;
  interestedService?: string;
  callStatus: string;
  feedbackNotes?: string;
  followUpDate?: Date | string;
  callDuration?: number; // seconds
  createdAt: Date;
}

export interface Followup {
  id: string;
  leadId: string;
  telecallerId: string;
  followupDate: Date | string;
  status: string;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  readStatus: boolean;
  createdAt: Date;
}
