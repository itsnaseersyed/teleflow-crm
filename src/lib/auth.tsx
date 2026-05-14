import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '@/services/authService';
import { useQuery } from '@tanstack/react-query';

interface AuthContextType {
  user: any;
  profile: any;
  loading: boolean;
  role: string | null;
  isAdmin: boolean;
  isTelecaller: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [fbUser, setFbUser] = useState<any>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setFbUser(user);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", fbUser?.uid],
    queryFn: () => fbUser ? authService.getUserProfile(fbUser.uid, fbUser.email) : null,
    enabled: !!fbUser,
  });

  // Use the same ID logic as the hook
  const appUser = fbUser ? {
    ...fbUser,
    uid: (profile as any)?.id || fbUser.uid,
    displayName: (profile as any)?.fullName || fbUser.displayName,
  } : null;

  const login = async (email: string, password: string) => {
    await authService.signIn(email, password);
  };

  const logout = async () => {
    await authService.signOut();
  };

  const value = {
    user: appUser,
    profile,
    loading: initializing || profileLoading,
    role: profile?.role || null,
    isAdmin: profile?.role === 'admin',
    isTelecaller: profile?.role === 'telecaller',
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
