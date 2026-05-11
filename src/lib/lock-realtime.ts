import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import type { LockStatus } from "@/lib/lead-lock";

/**
 * Real-time listener for lead lock status
 */
export function useLockRealtime(leadId: string | undefined, currentUserId: string | undefined) {
  const [lockStatus, setLockStatus] = useState<LockStatus>({ isLocked: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId || !currentUserId) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "leads", leadId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setLockStatus({ isLocked: false });
          setLoading(false);
          return;
        }

        const leadData = snapshot.data();
        const isLocked = leadData.isLocked || false;
        const lockedBy = leadData.lockedBy;
        const lockedByName = leadData.lockedByName;
        const lockedAt = leadData.lockedAt?.toDate?.() || (leadData.lockedAt ? new Date(leadData.lockedAt) : undefined);
        const lockExpiresAt = leadData.lockExpiresAt?.toDate?.() || (leadData.lockExpiresAt ? new Date(leadData.lockExpiresAt) : undefined);

        const isExpired = lockExpiresAt ? new Date() > lockExpiresAt : false;
        const isLockedByCurrentUser = lockedBy === currentUserId && !isExpired;

        setLockStatus({
          isLocked: isLocked && !isExpired,
          lockedBy: isExpired ? undefined : lockedBy,
          lockedByName: isExpired ? undefined : lockedByName,
          lockedAt,
          lockExpiresAt,
          isExpired,
          isLockedByCurrentUser,
        });
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to lock status:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [leadId, currentUserId]);

  return { lockStatus, loading };
}

/**
 * Check if current user can access lead
 */
export function useCanAccessLead(lockStatus: LockStatus, isAssignedToCurrentUser: boolean): boolean {
  // Can access if:
  // 1. Not locked, or
  // 2. Locked by current user, or
  // 3. Lock is expired
  return !lockStatus.isLocked || lockStatus.isLockedByCurrentUser || lockStatus.isExpired || !isAssignedToCurrentUser;
}
