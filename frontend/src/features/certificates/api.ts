import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getData, getPage, patchData } from '@/lib/api';
import type { Certificate, CertificateVerification, Paginated } from '@/types/api';

export const useMyCertificates = () => useQuery({ queryKey: ['certificates', 'me'], queryFn: () => getData<Certificate[]>('/certificates/me') });

export const useCertificates = (params: { page: number; eventId?: string; search?: string }, enabled = true) =>
  useQuery({
    queryKey: ['certificates', 'list', params],
    queryFn: () => getPage<Paginated<Certificate>>('/certificates', { params: { ...params, pageSize: 20, search: params.search || undefined } }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useRevokeCertificate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => patchData<Certificate>(`/certificates/${id}/revoke`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['certificates'] }),
  });
};

export const useVerification = (code: string) =>
  useQuery({
    queryKey: ['verify', code],
    queryFn: () => getData<CertificateVerification>(`/public/certificates/${encodeURIComponent(code)}`),
    retry: false,
  });
