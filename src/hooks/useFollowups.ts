import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { followupService } from "@/services/followupService";
import { toast } from "sonner";

export function useFollowups(userId?: string, status: string = "Pending") {
  return useInfiniteQuery({
    queryKey: ["followups", userId, status],
    queryFn: ({ pageParam }) => followupService.getFollowupsPaginated(userId, status, pageParam),
    initialPageParam: null as any,
    getNextPageParam: (lastPage) => lastPage.lastDoc || undefined,
    enabled: !!userId || userId === undefined, // Allow global if userId is explicitly undefined (admin)
  });
}

export function useFollowupMutations() {
  const qc = useQueryClient();

  const complete = useMutation({
    mutationFn: ({ id, leadId, userId }: { id: string, leadId: string | null, userId: string }) => 
      followupService.completeFollowup(id, leadId, userId),
    onSuccess: () => {
      toast.success("Follow-up completed");
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  return { complete };
}
