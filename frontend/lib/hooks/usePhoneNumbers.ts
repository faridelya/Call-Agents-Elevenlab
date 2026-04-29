import { useQuery } from '@tanstack/react-query';
import { phoneNumbers } from '@/lib/api';

export function usePhoneNumbers() {
  return useQuery({
    queryKey: ['phone-numbers'],
    queryFn: () => phoneNumbers.list(),
    staleTime: 60_000,
  });
}
