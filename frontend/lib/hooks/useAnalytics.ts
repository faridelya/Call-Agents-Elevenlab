import { useQuery } from '@tanstack/react-query';
import { analytics } from '@/lib/api';

export function useAnalyticsOverview() {
  return useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: analytics.overview,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useCallsOverTime(group_by: 'day' | 'hour' | 'week' = 'day') {
  return useQuery({
    queryKey: ['analytics', 'calls', group_by],
    queryFn: () => analytics.callsOverTime(group_by),
    staleTime: 60_000,
  });
}

export function useOutcomeDistribution() {
  return useQuery({
    queryKey: ['analytics', 'outcomes'],
    queryFn: analytics.outcomes,
    staleTime: 60_000,
  });
}

export function useAgentMetrics() {
  return useQuery({
    queryKey: ['analytics', 'agents'],
    queryFn: analytics.agents,
    staleTime: 60_000,
  });
}

export function useUsage() {
  return useQuery({
    queryKey: ['settings', 'usage'],
    queryFn: () => import('@/lib/api').then((m) => m.settings.usage()),
    staleTime: 5 * 60_000,
  });
}
