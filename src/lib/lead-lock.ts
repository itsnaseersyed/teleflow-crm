import { doc, updateDoc, getDoc, serverTimestamp, writeBatch, Timestamp } from "firebase/firestore";
import { db } from "@/services/firestore/client";

export const LOCK_DURATION_MINUTES = 10;

export interface LockStatus {
  isLocked: boolean;
  lockedBy?: string;
  lockedByName?: string;
  lockedAt?: Date;
  lockExpiresAt?: Date;
  isExpired?: boolean;
  isLockedByCurrentUser?: boolean;
}

/**
 * Attempt to acquire a lock on a lead
 */
export async function acquireLock(
  leadId: string,
  userId: string,
  userName: string,
): Promise<boolean> {
  try {
    const leadRef = doc(db, "leads", leadId);
    const snapshot = await getDoc(leadRef);
    const leadData = snapshot.data();

    // Check if already locked and not expired
    if (leadData?.isLocked && leadData?.lockExpiresAt) {
      const expiresAt = leadData.lockExpiresAt.toDate?.() || new Date(leadData.lockExpiresAt);
      if (new Date() < expiresAt) {
        // Lead is still locked by someone else
        return false;
      }
    }

    // Acquire lock using atomic update
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);

    await updateDoc(leadRef, {
      isLocked: true,
      lockedBy: userId,
      lockedByName: userName,
      lockedAt: serverTimestamp(),
      lockExpiresAt: expiresAt,
    });

    return true;
  } catch (error) {
    console.error("Failed to acquire lock:", error);
    return false;
  }
}

/**
 * Release a lock on a lead
 */
export async function releaseLock(leadId: string, userId: string): Promise<boolean> {
  try {
    const leadRef = doc(db, "leads", leadId);
    const snapshot = await getDoc(leadRef);
    const leadData = snapshot.data();

    // Only allow release if locked by current user or if lock is expired
    if (leadData?.lockedBy !== userId && leadData?.lockExpiresAt) {
      const expiresAt = leadData.lockExpiresAt.toDate?.() || new Date(leadData.lockExpiresAt);
      if (new Date() < expiresAt) {
        return false; // Not authorized to release
      }
    }

    await updateDoc(leadRef, {
      isLocked: false,
      lockedBy: null,
      lockedByName: null,
      lockedAt: null,
      lockExpiresAt: null,
    });

    return true;
  } catch (error) {
    console.error("Failed to release lock:", error);
    return false;
  }
}

/**
 * Refresh a lock's expiration time (extends the lock)
 */
export async function refreshLock(leadId: string, userId: string): Promise<boolean> {
  try {
    const leadRef = doc(db, "leads", leadId);
    const snapshot = await getDoc(leadRef);
    const leadData = snapshot.data();

    // Only refresh if locked by current user
    if (leadData?.lockedBy !== userId) {
      return false;
    }

    const newExpiresAt = new Date(new Date().getTime() + LOCK_DURATION_MINUTES * 60 * 1000);

    await updateDoc(leadRef, {
      lockExpiresAt: newExpiresAt,
    });

    return true;
  } catch (error) {
    console.error("Failed to refresh lock:", error);
    return false;
  }
}

/**
 * Check lock status of a lead
 */
export async function checkLockStatus(leadId: string, currentUserId: string): Promise<LockStatus> {
  try {
    const leadRef = doc(db, "leads", leadId);
    const snapshot = await getDoc(leadRef);
    const leadData = snapshot.data();

    const isLocked = leadData?.isLocked || false;
    const lockedBy = leadData?.lockedBy;
    const lockedByName = leadData?.lockedByName;
    const lockedAt = leadData?.lockedAt?.toDate?.() || (leadData?.lockedAt ? new Date(leadData.lockedAt) : undefined);
    const lockExpiresAt = leadData?.lockExpiresAt?.toDate?.() || (leadData?.lockExpiresAt ? new Date(leadData.lockExpiresAt) : undefined);

    const isExpired = lockExpiresAt ? new Date() > lockExpiresAt : false;
    const isLockedByCurrentUser = lockedBy === currentUserId && !isExpired;

    return {
      isLocked: isLocked && !isExpired,
      lockedBy: isExpired ? undefined : lockedBy,
      lockedByName: isExpired ? undefined : lockedByName,
      lockedAt,
      lockExpiresAt,
      isExpired,
      isLockedByCurrentUser,
    };
  } catch (error) {
    console.error("Failed to check lock status:", error);
    return { isLocked: false };
  }
}

/**
 * Force unlock a lead (admin only)
 */
export async function forceUnlock(leadId: string): Promise<boolean> {
  try {
    const leadRef = doc(db, "leads", leadId);

    await updateDoc(leadRef, {
      isLocked: false,
      lockedBy: null,
      lockedByName: null,
      lockedAt: null,
      lockExpiresAt: null,
    });

    return true;
  } catch (error) {
    console.error("Failed to force unlock:", error);
    return false;
  }
}

/**
 * Get all locked leads
 */
export async function getLockedLeads(): Promise<Array<{ id: string; lockedBy?: string; lockedByName?: string; lockExpiresAt?: Date }>> {
  try {
    // This would require a query in production
    // For now, return empty array - implement with collection query if needed
    return [];
  } catch (error) {
    console.error("Failed to get locked leads:", error);
    return [];
  }
}

/**
 * Format remaining lock time
 */
export function formatRemainingLockTime(lockExpiresAt: Date | undefined): string {
  if (!lockExpiresAt) return "";

  const now = new Date();
  const expiresAt = lockExpiresAt instanceof Date ? lockExpiresAt : new Date(lockExpiresAt);
  const diffMs = expiresAt.getTime() - now.getTime();

  if (diffMs <= 0) return "expired";

  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
