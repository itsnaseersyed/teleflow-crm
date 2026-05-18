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
  city?: string | null;
  leadStatus: "Unassigned" | "Assigned" | "In Progress" | "Completed" | "Follow-Up" | "Converted" | "Not Interested";
  assignedTo?: string | null; // uid of telecaller
  assignedAt?: Date | null;
  queuePosition?: number | null;
  uploadBatchId?: string | null; // Reference to import batch
  uploadSource?: string | null;
  lastCallStatus?: "Interested" | "Follow-Up Needed" | "Not Interested" | "Busy" | "No Response" | "Switched Off" | "Converted" | "Invalid Number" | null;
  lastCalledAt?: Date | null;
  completedStatus?: boolean | null;
  feedbackNotes?: string | null;
  followUpDate?: Date | string | null;
  createdBy: string; // uid of admin who created/added
  createdAt: Date;
  
  // Lead locking system
  isLocked?: boolean;
  lockedBy?: string; // uid of telecaller who locked
  lockedByName?: string; // Name of telecaller who locked
  lockedAt?: Date;
  lockExpiresAt?: Date;
  
  // Lead escalation system (junior → senior workflow)
  sourcedBy?: string; // uid of junior who identified this lead
  handledBy?: string; // uid of senior who closed the deal
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
  status: "pending" | "processing" | "completed" | "failed" | "active" | "archived";
  errorMessage?: string;
  summary: {
    successful: number;
    failed: number;
    duplicates: number;
  };
  
  // NEW: Daily batch tracking fields
  batchDate?: Date; // Date batch was imported (YYYY-MM-DD)
  dayIdentifier?: string; // Batch_2026-05-11 format
  batchStatus?: "active" | "completed" | "archived"; // Lifecycle status
  
  // NEW: Assignment metrics
  assignedLeadsCount?: number; // How many leads are assigned
  completedCallsCount?: number; // How many calls have been made
  
  // NEW: Daily metrics
  dailyMetrics?: {
    assignedToday?: number;
    completedToday?: number;
    convertedToday?: number;
    assignmentTime?: Date;
  };
}

export interface Call {
  id: string;
  leadId: string;
  telecallerId: string;
  customerName: string;
  mobileNumber: string;
  city?: string | null;
  callStatus: string;
  feedbackNotes?: string | null;
  followUpDate?: Date | string | null;
  callDuration?: number | null; // seconds
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

export interface DashboardStats {
  totalLeads: number;
  assignedLeads: number;
  unassignedLeads: number;
  convertedLeads: number;
  notInterestedLeads: number;
  followUpLeads: number;
  inProgressLeads: number;
  completedLeads: number;
  totalCalls: number;
  telecallerCount: number;
  lastUpdated: any;
}

export interface UserStats {
  userId: string;
  totalLeads: number;
  assignedLeads: number;
  convertedLeads: number;
  notInterestedLeads: number;
  followUpLeads: number;
  inProgressLeads: number;
  completedLeads: number;
  callsToday: number;
  totalCalls: number;
  lastUpdated: any;
}
