import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, collection, query, where, getCountFromServer } from "firebase/firestore";
import { db } from "./firestore/client";
import { DashboardStats, UserStats } from "./firestore/types";

const GLOBAL_STATS_ID = "global";

/**
 * Stats Service
 * Manages atomic increments for dashboard metrics
 */
export const statsService = {
  /**
   * Get global dashboard stats
   */
  async getGlobalStats(): Promise<DashboardStats | null> {
    const snap = await getDoc(doc(db, "stats", GLOBAL_STATS_ID));
    if (snap.exists()) {
      return snap.data() as DashboardStats;
    }
    
    // Lazy initialize if missing
    const initial = {
      totalLeads: 0,
      assignedLeads: 0,
      unassignedLeads: 0,
      convertedLeads: 0,
      notInterestedLeads: 0,
      followUpLeads: 0,
      inProgressLeads: 0,
      completedLeads: 0,
      totalCalls: 0,
      telecallerCount: 0,
      lastUpdated: serverTimestamp() as any,
    };
    await setDoc(doc(db, "stats", GLOBAL_STATS_ID), initial);
    return initial as DashboardStats;
  },

  /**
   * Get stats for a specific telecaller
   */
  async getUserStats(userId: string): Promise<UserStats | null> {
    const ref = doc(db, "stats", `user_${userId}`);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserStats;
    }
    
    const initialStats: UserStats = {
      userId,
      totalLeads: 0,
      assignedLeads: 0,
      convertedLeads: 0,
      notInterestedLeads: 0,
      followUpLeads: 0,
      inProgressLeads: 0,
      completedLeads: 0,
      callsToday: 0,
      totalCalls: 0,
      lastUpdated: serverTimestamp() as any,
    };
    await setDoc(ref, initialStats);
    return initialStats;
  },

  /**
   * Update stats when a lead status changes (Safe Version)
   */
  async updateStatusStats(oldStatus: string, newStatus: string, userId?: string) {
    const ref = doc(db, "stats", GLOBAL_STATS_ID);
    
    // Use setDoc with merge: true to avoid needing initGlobalStats

    const updates: any = {
      lastUpdated: serverTimestamp() as any,
    };

    const getStatField = (status: string) => {
      switch (status) {
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

    const oldField = getStatField(oldStatus);
    const newField = getStatField(newStatus);

    if (oldField) updates[oldField] = increment(-1);
    if (newField) updates[newField] = increment(1);

    if (Object.keys(updates).length > 1) {
      await setDoc(ref, updates, { merge: true });
    }

    if (userId) {
      const userRef = doc(db, "stats", `user_${userId}`);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
         await setDoc(userRef, {
           userId,
           totalLeads: 1,
           assignedLeads: newStatus === "Assigned" ? 1 : 0,
           convertedLeads: newStatus === "Converted" ? 1 : 0,
           notInterestedLeads: newStatus === "Not Interested" ? 1 : 0,
           followUpLeads: newStatus === "Follow-Up" ? 1 : 0,
           callsToday: 0,
           totalCalls: 0,
           lastUpdated: serverTimestamp() as any,
         });
      } else {
        const userUpdates: any = { lastUpdated: serverTimestamp() as any };
        if (oldField) userUpdates[oldField] = increment(-1);
        if (newField) userUpdates[newField] = increment(1);
        await updateDoc(userRef, userUpdates);
      }
    }
  },

  /**
   * Update stats when a call is logged
   */
  async incrementCallCount(userId: string) {
    const ref = doc(db, "stats", GLOBAL_STATS_ID);
    
    // Update global
    await setDoc(ref, {
      totalCalls: increment(1),
      lastUpdated: serverTimestamp() as any,
    }, { merge: true });

    // Update user
    const userRef = doc(db, "stats", `user_${userId}`);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      await updateDoc(userRef, {
        totalCalls: increment(1),
        callsToday: increment(1),
        lastUpdated: serverTimestamp() as any,
      });
    } else {
      await setDoc(userRef, {
        userId,
        totalCalls: 1,
        callsToday: 1,
        lastUpdated: serverTimestamp() as any,
      }, { merge: true });
    }
  },

  /**
   * Arbitrary update for user stats (Required for Follow-ups)
   */
  async updateUserStats(userId: string, updates: Record<string, number>) {
    const userRef = doc(db, "stats", `user_${userId}`);
    const firestoreUpdates: any = { lastUpdated: serverTimestamp() as any };
    
    for (const [key, value] of Object.entries(updates)) {
      firestoreUpdates[key] = increment(value);
    }

    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      await updateDoc(userRef, firestoreUpdates);
    } else {
      await setDoc(userRef, {
        userId,
        ...updates,
        lastUpdated: serverTimestamp() as any,
      }, { merge: true });
    }
  },
  
  /**
   * Update stats when a new lead is created
   */
  async incrementLeadCount(isAssigned: boolean) {
    const ref = doc(db, "stats", GLOBAL_STATS_ID);
    
    const updates: any = {
      totalLeads: increment(1),
      lastUpdated: serverTimestamp() as any,
    };

    if (isAssigned) {
      updates.assignedLeads = increment(1);
    } else {
      updates.unassignedLeads = increment(1);
    }

    await setDoc(ref, updates, { merge: true });
  },

  /**
   * RE-SYNC ALL STATS (Admin Only)
   * Scans the entire collection to reset dashboard counters to reality.
   * Use this to fix negative numbers or drift.
   */
  async syncStats() {
    const leadsRef = collection(db, "leads");
    const usersRef = collection(db, "users");
    
    // 1. Get real counts from server
    const [
      totalSnap,
      unassignedSnap,
      assignedSnap,
      inProgressSnap,
      followUpSnap,
      completedSnap,
      convertedSnap,
      notInterestedSnap,
      usersSnap
    ] = await Promise.all([
      getCountFromServer(query(leadsRef)),
      getCountFromServer(query(leadsRef, where("leadStatus", "==", "Unassigned"))),
      getCountFromServer(query(leadsRef, where("leadStatus", "==", "Assigned"))),
      getCountFromServer(query(leadsRef, where("leadStatus", "==", "In Progress"))),
      getCountFromServer(query(leadsRef, where("leadStatus", "==", "Follow-Up"))),
      getCountFromServer(query(leadsRef, where("leadStatus", "==", "Completed"))),
      getCountFromServer(query(leadsRef, where("leadStatus", "==", "Converted"))),
      getCountFromServer(query(leadsRef, where("leadStatus", "==", "Not Interested"))),
      getCountFromServer(query(usersRef, where("role", "==", "telecaller")))
    ]);

    const newStats = {
      totalLeads: totalSnap.data().count,
      unassignedLeads: unassignedSnap.data().count,
      assignedLeads: assignedSnap.data().count,
      inProgressLeads: inProgressSnap.data().count,
      followUpLeads: followUpSnap.data().count,
      completedLeads: completedSnap.data().count,
      convertedLeads: convertedSnap.data().count,
      notInterestedLeads: notInterestedSnap.data().count,
      telecallersCount: usersSnap.data().count,
      lastUpdated: serverTimestamp(),
      lastSync: serverTimestamp()
    };

    // 2. Overwrite the global stats document with reality
    await setDoc(doc(db, "stats", GLOBAL_STATS_ID), newStats, { merge: true });
    
    return newStats;
  }
};

