import { useQuery } from "@tanstack/react-query";
import { statsService } from "@/services/statsService";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["stats", "global"],
    queryFn: async () => {
      await statsService.initGlobalStats();
      return statsService.getGlobalStats();
    },
    staleTime: 1000 * 30, // 30 seconds (faster sync)
    refetchOnWindowFocus: true,
  });
}

export function useUserStats(userId?: string) {
  return useQuery({
    queryKey: ["stats", "user", userId],
    queryFn: () => userId ? statsService.getUserStats(userId) : null,
    enabled: !!userId,
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: true,
  });
}
