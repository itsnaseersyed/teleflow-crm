import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { leadService } from "@/services/leadService";
import { QueryDocumentSnapshot, DocumentData } from "firebase/firestore";

export function useAllLeads(filters: { status?: string; assignedTo?: string }, options?: { staleTime?: number, refetchOnWindowFocus?: boolean }) {
  return useQuery({
    queryKey: ["leads", "all", filters],
    queryFn: () => leadService.getLeads(filters),
    staleTime: options?.staleTime ?? 1000 * 60 * 5,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
  });
}

export function useLeadsPaginated(filters: { status?: string; assignedTo?: string }, options?: { staleTime?: number, refetchOnWindowFocus?: boolean }) {
  return useInfiniteQuery({
    queryKey: ["leads", filters],
    queryFn: ({ pageParam }) => 
      leadService.getLeadsPaginated({ 
        lastDoc: pageParam as QueryDocumentSnapshot<DocumentData> | null, 
        status: filters.status,
        assignedTo: filters.assignedTo
      }),
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.lastDoc : undefined,
    staleTime: options?.staleTime ?? 1000 * 60 * 5,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
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
