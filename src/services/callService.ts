import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
  doc,
  updateDoc
} from "firebase/firestore";
import { db } from "./firestore/client";
import { Call, Followup } from "./firestore/types";
import { statsService } from "./statsService";

const CALLS_COLLECTION = "calls";
const FOLLOWUPS_COLLECTION = "followups";

export const callService = {
  /**
   * Log a call and update lead status
   */
  async logCall(data: Partial<Call>, oldLeadStatus: string, newLeadStatus: string) {
    const callData = {
      ...data,
      createdAt: serverTimestamp(),
    };
    
    const callRef = await addDoc(collection(db, CALLS_COLLECTION), callData);
    
    // Increment global and user call stats
    if (data.telecallerId) {
      await statsService.incrementCallCount(data.telecallerId);
    }

    // Handle Lead Status update stats handled by caller
    return callRef.id;
  },

  /**
   * Get paginated calls for a lead or telecaller
   */
  async getCallsPaginated(params: {
    leadId?: string;
    telecallerId?: string;
    pageSize?: number;
    lastDoc?: QueryDocumentSnapshot<DocumentData> | null;
  }) {
    const { leadId, telecallerId, pageSize = 20, lastDoc = null } = params;

    let q = query(
      collection(db, CALLS_COLLECTION),
      orderBy("createdAt", "desc"),
      limit(pageSize)
    );

    if (leadId) q = query(q, where("leadId", "==", leadId));
    if (telecallerId) q = query(q, where("telecallerId", "==", telecallerId));
    if (lastDoc) q = query(q, startAfter(lastDoc));

    const snapshot = await getDocs(q);
    const calls = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Call));

    return {
      calls,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === pageSize
    };
  },

  /**
   * Get paginated follow-ups
   */
  async getFollowupsPaginated(params: {
    telecallerId?: string;
    status?: string;
    pageSize?: number;
    lastDoc?: QueryDocumentSnapshot<DocumentData> | null;
  }) {
    const { telecallerId, status = "Pending", pageSize = 20, lastDoc = null } = params;

    let q = query(
      collection(db, FOLLOWUPS_COLLECTION),
      where("status", "==", status),
      orderBy("followupDate", "asc"),
      limit(pageSize)
    );

    if (telecallerId) q = query(q, where("telecallerId", "==", telecallerId));
    if (lastDoc) q = query(q, startAfter(lastDoc));

    const snapshot = await getDocs(q);
    const followups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Followup));

    return {
      followups,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === pageSize
    };
  }
};
