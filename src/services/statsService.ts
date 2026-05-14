import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
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
    return null;
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
    
    // Initialize if missing
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
   * Initialize global stats doc if it doesn't exist
   */
  async initGlobalStats() {
    const ref = doc(db, "stats", GLOBAL_STATS_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
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
      });
    }
  },

  /**
   * Update stats when a lead status changes (Safe Version)
   */
  async updateStatusStats(oldStatus: string, newStatus: string, userId?: string) {
    const ref = doc(db, "stats", GLOBAL_STATS_ID);
    
    // Ensure global doc exists
    await this.initGlobalStats();

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
      await updateDoc(ref, updates);
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
    await this.initGlobalStats();
    
    // Update global
    await updateDoc(doc(db, "stats", GLOBAL_STATS_ID), {
      totalCalls: increment(1),
      lastUpdated: serverTimestamp() as any,
    });

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
    await this.initGlobalStats();
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

    await updateDoc(ref, updates);
  }
};

