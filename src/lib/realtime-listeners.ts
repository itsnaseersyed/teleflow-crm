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
} from "firebase/firestore";
import { db } from "@/services/firestore/client";

/**
 * Real-time hook for user's assigned leads
 */
export function useMyLeadsRealtime(
  userId: string | undefined,
  leadStatus?: string,
) {
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | undefined;

    try {
      const constraints = [where("assignedTo", "==", userId)];
      if (leadStatus) {
        constraints.push(where("leadStatus", "==", leadStatus));
      }

      const q = query(collection(db, "leads"), ...constraints);

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setLeads(data);
          setIsLoading(false);
        },
        (err) => {
          setError(err as Error);
          setIsLoading(false);
        },
      );
    } catch (err) {
      setError(err as Error);
      setIsLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId, leadStatus]);

  return { leads, isLoading, error };
}

/**
 * Real-time hook for lead assignment updates
 */
export function useLeadAssignmentUpdates(userId: string | undefined) {
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
 * Real-time hook for all leads (admin view)
 */
export function useAllLeadsRealtime(
  isAdmin: boolean,
  leadStatus?: string,
) {
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | undefined;

    try {
      const constraints: any[] = [];
      if (leadStatus) {
        constraints.push(where("leadStatus", "==", leadStatus));
      }

      const q = query(collection(db, "leads"), ...constraints);

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setLeads(data);
          setIsLoading(false);
        },
        (err) => {
          setError(err as Error);
          setIsLoading(false);
        },
      );
    } catch (err) {
      setError(err as Error);
      setIsLoading(false);
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isAdmin, leadStatus]);

  return { leads, isLoading, error };
}

/**
 * Real-time hook for dashboard statistics
 */
export function useDashboardStatsRealtime(
  userId: string | undefined,
  role: string | undefined,
) {
  const [stats, setStats] = useState({
    totalLeads: 0,
    convertedLeads: 0,
    assignedToMe: 0,
    pendingFollowups: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    let unsubscribe: Unsubscribe | undefined;

    try {
      // Get total leads
      const allLeadsQ = query(collection(db, "leads"));

      unsubscribe = onSnapshot(
        allLeadsQ,
        (snapshot) => {
          const newStats = {
            totalLeads: 0,
            convertedLeads: 0,
            assignedToMe: 0,
            pendingFollowups: 0,
          };

          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            newStats.totalLeads++;

            if (data.leadStatus === "Converted") {
              newStats.convertedLeads++;
            }

            if (data.assignedTo === userId) {
              newStats.assignedToMe++;
            }
          });

          setStats(newStats);
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
  }, [userId, role]);

  return { ...stats, isLoading };
}
