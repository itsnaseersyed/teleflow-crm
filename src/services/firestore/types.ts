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
}

export interface Lead {
  id: string;
  customerName: string;
  mobileNumber: string;
  leadStatus: string;
  assignedTo?: string; // uid
  createdBy: string; // uid
  createdAt: Date;
}

export interface Call {
  id: string;
  leadId: string;
  telecallerId: string;
  customerName: string;
  callStatus: string;
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
