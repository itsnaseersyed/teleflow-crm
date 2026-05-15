/**
 * Real-time Firebase listeners
 * Provides React hooks for real-time updates from Firestore
 */

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  Unsubscribe,
  doc
} from "firebase/firestore";
import { db } from "@/services/firestore/client";

/**
 * Real-time hook for user's assigned leads (DISABLED)
 * This was listening to the entire assigned leads list. Use TanStack Query with pagination instead.
 */
export function useMyLeadsRealtime(
  userId: string | undefined,
  leadStatus?: string,
) {
  return { leads: [], isLoading: false, error: new Error("useMyLeadsRealtime is deprecated. Use useLeads (TanStack Query) instead.") };
}

/**
 * Real-time hook for lead assignment updates
 * Keep this one as it's typically used for a small subset of "New" leads.
 */
export function useLeadAssignmentUpdates(userId: string | undefined) {
  // ... (keep current implementation as it's more specialized)
  const [assignmentStats, setAssignmentStats] = useState({
    assigned: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | undefined;

    try {
      const q = query(collection(db, "leads"), where("assignedTo", "==", userId));

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const stats = {
            assigned: 0,
            pending: 0,
            inProgress: 0,
            completed: 0,
          };

          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            if (!data.leadStatus) {
              stats.pending++;
            } else if (data.leadStatus === "Assigned") {
              stats.assigned++;
            } else if (data.leadStatus === "In Progress") {
              stats.inProgress++;
            } else if (data.leadStatus === "Completed") {
              stats.completed++;
            }
          });

          setAssignmentStats(stats);
          setIsLoading(false);
        },
        () => {
          setIsLoading(false);
        },
      );
    } catch {
      setIsLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId]);

  return { ...assignmentStats, isLoading };
}

/**
 * Real-time hook for lead import updates
 */
export function useImportBatchUpdates(userId: string | undefined) {
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | undefined;

    try {
      const q = query(
        collection(db, "leadImportBatches"),
        where("uploadedBy", "==", userId),
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as any[];
          setBatches(
            data.sort((a, b) => {
              const aTime = a.uploadedAt?.toDate?.()?.getTime() || 0;
              const bTime = b.uploadedAt?.toDate?.()?.getTime() || 0;
              return bTime - aTime;
            })
          );
          setIsLoading(false);
        },
        () => {
          setIsLoading(false);
        },
      );
    } catch {
      setIsLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId]);

  return { batches, isLoading };
}

/**
 * Real-time hook for all leads (DISABLED)
 * This was listening to the entire leads collection. Use TanStack Query with pagination instead.
 */
export function useAllLeadsRealtime(
  isAdmin: boolean,
  leadStatus?: string,
) {
  return { leads: [], isLoading: false, error: new Error("useAllLeadsRealtime is deprecated. Use useLeads (TanStack Query) instead.") };
}


/**
 * Real-time hook for dashboard statistics (OPTIMIZED)
 * Subscribes to the specific stats document instead of the entire leads collection.
 */
export function useDashboardStatsRealtime(
  userId: string | undefined,
  role: string | undefined,
) {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    let unsubGlobal: Unsubscribe | undefined;
    let unsubUser: Unsubscribe | undefined;

    try {
      // 1. Subscribe to Global Stats
      unsubGlobal = onSnapshot(doc(db, "stats", "global"), (snap: any) => {
        if (snap.exists()) {
          const globalData = snap.data();
          setStats((prev: any) => ({ ...prev, ...globalData }));
        }
        setIsLoading(false);
      });

      // 2. Subscribe to User Stats if not admin
      if (role !== "admin") {
        unsubUser = onSnapshot(doc(db, "stats", `user_${userId}`), (snap: any) => {
          if (snap.exists()) {
            const userData = snap.data();
            setStats((prev: any) => ({ ...prev, userStats: userData }));
          }
        });
      }
    } catch (err) {
      console.error("Error in dashboard stats listener:", err);
      setIsLoading(false);
    }

    return () => {
      unsubGlobal?.();
      unsubUser?.();
    };
  }, [userId, role]);

  return { stats, isLoading };
}

/**
 * Real-time hook for all leads (admin view) - REMOVED HEAVY SCANNING
 * Instead of onSnapshot on the whole collection, use paginated queries or a lightweight summary.
 * For this audit, we'll suggest using useLeadsPaginated instead of this real-time hook.
 */
export function useAllLeadsRealtimeDisabled() {
  // This hook should be deprecated in favor of paginated fetching (TanStack Query)
  return { leads: [], isLoading: false, error: new Error("useAllLeadsRealtime is deprecated for performance reasons. Use paginated fetching.") };
}

