import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
  writeBatch,
  increment
} from "firebase/firestore";
import { db } from "./firestore/client";
import { Lead } from "./firestore/types";
import { statsService } from "./statsService";

const LEADS_COLLECTION = "leads";

export const leadService = {
  /**
   * Fetch all leads matching filters (no pagination)
   */
  async getLeads(params: {
    status?: string;
    assignedTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { 
      status, 
      assignedTo, 
      sortBy = "createdAt", 
      sortOrder = "desc" 
    } = params;

    let q = query(
      collection(db, LEADS_COLLECTION),
      orderBy(sortBy, sortOrder)
    );

    if (status && status !== "All") {
      q = query(q, where("leadStatus", "==", status));
    }

    if (assignedTo) {
      q = query(q, where("assignedTo", "==", assignedTo));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
  },

  /**
   * Fetch leads with pagination
   */
  async getLeadsPaginated(params: {
    pageSize?: number;
    lastDoc?: QueryDocumentSnapshot<DocumentData> | null;
    status?: string;
    assignedTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { 
      pageSize = 20, 
      lastDoc = null, 
      status, 
      assignedTo, 
      sortBy = "createdAt", 
      sortOrder = "desc" 
    } = params;

    let q = query(
      collection(db, LEADS_COLLECTION),
      orderBy(sortBy, sortOrder),
      limit(pageSize)
    );

    if (status && status !== "All") {
      q = query(q, where("leadStatus", "==", status));
    }

    if (assignedTo) {
      q = query(q, where("assignedTo", "==", assignedTo));
    }

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const leads = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
    
    return {
      leads,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === pageSize
    };
  },

  /**
   * Get single lead by ID
   */
  async getLeadById(id: string): Promise<Lead | null> {
    const snap = await getDoc(doc(db, LEADS_COLLECTION, id));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Lead;
    }
    return null;
  },

  /**
   * Create a new lead
   */
  async createLead(data: Partial<Lead>) {
    const leadData = {
      ...data,
      leadStatus: data.leadStatus || "Unassigned",
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, LEADS_COLLECTION), leadData);
    
    // Update stats
    await statsService.incrementLeadCount(!!data.assignedTo);
    
    return docRef.id;
  },

  /**
   * Update lead status with stats tracking
   */
  async updateLead(leadId: string, updates: any, oldStatus?: string) {
    await updateDoc(doc(db, "leads", leadId), {
      ...updates,
      lastModifiedAt: serverTimestamp()
    });

    if (oldStatus && updates.leadStatus && oldStatus !== updates.leadStatus) {
      await statsService.updateStatusStats(oldStatus, updates.leadStatus);
    }
  },

  async updateLeadStatus(leadId: string, oldStatus: string, newStatus: string, userId?: string, extraData?: any) {
    const ref = doc(db, LEADS_COLLECTION, leadId);
    const updates = {
      leadStatus: newStatus,
      lastCalledAt: serverTimestamp(),
      ...extraData // Merge notes, date, etc.
    };
    
    await updateDoc(ref, updates);

    // Sync stats
    await statsService.updateStatusStats(oldStatus, newStatus, userId);
  },

  /**
   * Assign leads to a telecaller
   */
  async assignLeads(leadIds: string[], telecallerId: string) {
    const batch = writeBatch(db);
    
    for (const id of leadIds) {
      const ref = doc(db, LEADS_COLLECTION, id);
      batch.update(ref, {
        assignedTo: telecallerId,
        assignedAt: serverTimestamp(),
        leadStatus: "Assigned"
      });
    }

    await batch.commit();
    
    // Optimized stats update: Single call with calculated increment
    const count = leadIds.length;
    await statsService.updateUserStats(telecallerId, {
      assignedLeads: count,
      totalLeads: count
    });
    
    // Update global stats
    await updateDoc(doc(db, "stats", "global"), {
      unassignedLeads: increment(-count),
      assignedLeads: increment(count),
      lastUpdated: serverTimestamp()
    });
  },

  /**
   * Delete a lead
   */
  async deleteLead(leadId: string, status: string) {
    await deleteDoc(doc(db, LEADS_COLLECTION, leadId));
    
    // Update stats (decrement)
    const ref = doc(db, "stats", "global");
    const getStatField = (s: string) => {
      switch (s) {
        case "Converted": return "convertedLeads";
        case "Not Interested": return "notInterestedLeads";
        case "Follow-Up": return "followUpLeads";
        case "In Progress": return "inProgressLeads";
        case "Completed": return "completedLeads";
        case "Assigned": return "assignedLeads";
        case "Unassigned": return "unassignedLeads";
        default: return null;
      }
    };
    
    const field = getStatField(status);
    const updates: any = { totalLeads: increment(-1) };
    if (field) updates[field] = increment(-1);
    
    await updateDoc(ref, updates);
  },

  /**
   * Nuclear Option: Delete ALL leads in the database
   */
  async deleteAllLeads() {
    const q = query(collection(db, LEADS_COLLECTION));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return;

    // Delete in batches of 500 (Firestore limit)
    let batch = writeBatch(db);
    let count = 0;

    for (const d of snapshot.docs) {
      batch.delete(d.ref);
      count++;
      
      if (count === 500) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    // Reset global lead stats
    await updateDoc(doc(db, "stats", "global"), {
      totalLeads: 0,
      assignedLeads: 0,
      unassignedLeads: 0,
      convertedLeads: 0,
      notInterestedLeads: 0,
      followUpLeads: 0,
      inProgressLeads: 0,
      completedLeads: 0,
      lastUpdated: serverTimestamp()
    });
  }
};
