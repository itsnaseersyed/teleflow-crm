import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { leadService } from "@/services/leadService";

export function useLeadsPaginated(filters: { status?: string; assignedTo?: string }) {
  return useInfiniteQuery({
    queryKey: ["leads", filters],
    queryFn: ({ pageParam = null }) => 
      leadService.getLeadsPaginated({ 
        lastDoc: pageParam, 
        status: filters.status,
        assignedTo: filters.assignedTo
      }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.lastDoc : undefined,
    staleTime: 1000 * 60 * 5,
  });
}

export function useLeadMutations() {
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: ({ leadId, oldStatus, newStatus, userId, extraData }: { leadId: string, oldStatus: string, newStatus: string, userId?: string, extraData?: any }) =>
      leadService.updateLeadStatus(leadId, oldStatus, newStatus, userId, extraData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    }
  });

  const assignLeads = useMutation({
    mutationFn: ({ leadIds, telecallerId }: { leadIds: string[], telecallerId: string }) =>
      leadService.assignLeads(leadIds, telecallerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    }
  });

  const updateLead = useMutation({
    mutationFn: ({ leadId, updates, oldStatus }: { leadId: string, updates: any, oldStatus?: string }) =>
      leadService.updateLead(leadId, updates, oldStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    }
  });

  return { updateStatus, assignLeads, updateLead };
}
