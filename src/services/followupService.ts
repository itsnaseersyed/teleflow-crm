import { 
  collection, 
  query, 
  where, 
  getDocs, 
  limit,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "./firestore/client";
import { statsService } from "./statsService";

export const followupService = {
  /**
   * Get follow-ups from the LEADS collection (Matches My Leads logic)
   */
  async getFollowupsPaginated(userId: string | undefined, status: string = "Pending", lastDoc?: any) {
    // We query the "leads" collection just like the My Leads page
    // Status mapping: "Pending" followups are leads with status "Follow-Up"
    const leadStatus = status === "Pending" ? "Follow-Up" : "Completed";

    let q = query(
      collection(db, "leads"),
      where("leadStatus", "==", leadStatus),
      limit(100)
    );

    if (userId) {
      q = query(q, where("assignedTo", "==", userId));
    }

    const snapshot = await getDocs(q);
    
    // Map leads to the Followup format the UI expects
    const items = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        leadId: d.id,
        customerName: data.customerName,
        mobileNumber: data.mobileNumber,
        notes: data.feedbackNotes || "",
        status: status, // Pending or Completed
        telecallerId: data.assignedTo,
        followupDate: data.followUpDate || null
      };
    });

    // Sort by date locally to avoid Index Requirement
    items.sort((a: any, b: any) => {
      if (!a.followupDate) return 1;
      if (!b.followupDate) return -1;
      const dateA = new Date(a.followupDate).getTime();
      const dateB = new Date(b.followupDate).getTime();
      return status === "Pending" ? dateA - dateB : dateB - dateA;
    });

    return {
      items,
      lastDoc: snapshot.docs[snapshot.docs.length - 1]
    };
  },

  /**
   * Complete a follow-up by updating the Lead Status
   */
  async completeFollowup(followupId: string, leadId: string | null, userId: string) {
    // "Completing" a follow-up means moving the lead to "Completed"
    const leadRef = doc(db, "leads", leadId || followupId);
    await updateDoc(leadRef, {
      leadStatus: "Completed",
      lastUpdated: serverTimestamp()
    });

    // Update stats
    await statsService.updateStatusStats("Follow-Up", "Completed", userId);
  }
};
