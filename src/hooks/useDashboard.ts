import { useQuery } from "@tanstack/react-query";
import { statsService } from "@/services/statsService";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["stats", "global"],
    queryFn: async () => {
      return statsService.getGlobalStats();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export function useUserStats(userId?: string) {
  return useQuery({
    queryKey: ["stats", "user", userId],
    queryFn: () => userId ? statsService.getUserStats(userId) : null,
    enabled: !!userId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: false,
  });
}
