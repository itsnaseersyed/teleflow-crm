import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/authService";

export function useAuth() {
  const queryClient = useQueryClient();
  const [fbUser, setFbUser] = useState<any>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setFbUser(user);
      if (initializing) setInitializing(false);
      // If user logs out, clear query cache
      if (!user) {
        queryClient.clear();
      }
    });
    return unsubscribe;
  }, [initializing, queryClient]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", fbUser?.uid],
    queryFn: () => fbUser ? authService.getUserProfile(fbUser.uid, fbUser.email) : null,
    enabled: !!fbUser,
    staleTime: 1000 * 60 * 30, // 30 mins
  });

  // CRITICAL: We override the UID with the Profile ID (the Firestore Document ID)
  // This ensures all queries like where("assignedTo", "==", user.uid) use the DB ID.
  const appUser = fbUser ? {
    ...fbUser,
    uid: (profile as any)?.id || fbUser.uid,
    displayName: (profile as any)?.fullName || fbUser.displayName,
  } : null;

  return {
    user: appUser,
    profile,
    loading: initializing || profileLoading,
    role: profile?.role,
    isAdmin: profile?.role === "admin",
    isTelecaller: profile?.role === "telecaller",
    logout: async () => {
      await authService.signOut();
      queryClient.clear();
    }
  };
}
