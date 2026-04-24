import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calls } from '@/lib/api';

export const CALLS_KEY = ['calls'];

export function useCalls(page = 1, agent_id?: string, direction?: 'inbound' | 'outbound') {
  return useQuery({
    queryKey: [...CALLS_KEY, page, agent_id, direction],
    queryFn: () => calls.list(page, agent_id, direction),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useCall(id: string | null) {
  return useQuery({
    queryKey: [...CALLS_KEY, id],
    queryFn: () => calls.get(id!),
    enabled: !!id,
  });
}

export function useActiveCalls() {
  return useQuery({
    queryKey: [...CALLS_KEY, 'active'],
    queryFn: calls.active,
    refetchInterval: 5_000,
    staleTime: 0,
  });
}

export function useOutboundCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agent_id, to_number, phone_number_id }: { agent_id: string; to_number: string; phone_number_id?: string }) =>
      calls.outbound(agent_id, to_number, phone_number_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CALLS_KEY }),
  });
}

export function useEndCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => calls.end(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: CALLS_KEY }),
  });
}
