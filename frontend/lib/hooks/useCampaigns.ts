import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { campaigns, type CampaignCreate } from '@/lib/api';

export const CAMPAIGNS_KEY = ['campaigns'];

export function useCampaigns(page = 1) {
  return useQuery({
    queryKey: [...CAMPAIGNS_KEY, page],
    queryFn: () => campaigns.list(page),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: [...CAMPAIGNS_KEY, id],
    queryFn: () => campaigns.get(id!),
    enabled: !!id,
    refetchInterval: 10_000,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CampaignCreate) => campaigns.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  });
}

export function useUpdateCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CampaignCreate>) => campaigns.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  });
}

export function useCampaignAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'pause' | 'resume' | 'stop' }) =>
      campaigns[action](id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => campaigns.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CAMPAIGNS_KEY }),
  });
}
