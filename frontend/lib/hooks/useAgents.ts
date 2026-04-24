import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agents, type AgentCreate } from '@/lib/api';

export const AGENTS_KEY = ['agents'];

export function useAgents(page = 1) {
  return useQuery({
    queryKey: [...AGENTS_KEY, page],
    queryFn: () => agents.list(page),
    staleTime: 30_000,
  });
}

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: [...AGENTS_KEY, id],
    queryFn: () => agents.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useVoices() {
  return useQuery({
    queryKey: ['voices'],
    queryFn: agents.voices,
    staleTime: 5 * 60_000,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentCreate) => agents.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useUpdateAgent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AgentCreate>) => agents.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }),
  });
}

export function useSyncAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agents.sync(id),
    onSuccess: (_data, id) => qc.invalidateQueries({ queryKey: [...AGENTS_KEY, id] }),
  });
}
