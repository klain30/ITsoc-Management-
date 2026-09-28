import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteRequest, getData, getPage, patchData, postData } from '@/lib/api';
import type { AccessLink, Member, MemberDetail, MembershipStatus, Paginated, Role, RoleMatrix } from '@/types/api';

export type MemberFilters = { page: number; search?: string; status?: MembershipStatus | ''; role?: Role | ''; officersOnly?: boolean; pageSize?: number };

export type MemberInput = {
  studentId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  course: string;
  yearLevel: number;
  section?: string | null;
  contactNumber?: string | null;
  status?: MembershipStatus;
};

export const memberKeys = {
  all: ['members'] as const,
  list: (filters: MemberFilters) => ['members', 'list', filters] as const,
  detail: (id: string) => ['members', 'detail', id] as const,
};

export const useMembers = (filters: MemberFilters, enabled = true) =>
  useQuery({
    queryKey: memberKeys.list(filters),
    queryFn: () =>
      getPage<Paginated<Member>>('/members', {
        params: {
          ...filters,
          search: filters.search || undefined,
          status: filters.status || undefined,
          role: filters.role || undefined,
          officersOnly: filters.officersOnly || undefined,
        },
      }),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useMember = (id: string) => useQuery({ queryKey: memberKeys.detail(id), queryFn: () => getData<MemberDetail>(`/members/${id}`) });

export const useRoleMatrix = () => useQuery({ queryKey: ['roles'], queryFn: () => getData<RoleMatrix>('/roles'), staleTime: 5 * 60_000 });

const useInvalidateMembers = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: memberKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['positions'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
};

export const useCreateMember = () => {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (input: MemberInput) => postData<{ member: Member; invitation: AccessLink }>('/members', input),
    onSuccess: invalidate,
  });
};

export const useUpdateMember = (id: string) => {
  const invalidate = useInvalidateMembers();
  return useMutation({ mutationFn: (input: Partial<MemberInput>) => patchData<Member>(`/members/${id}`, input), onSuccess: invalidate });
};

export const useDeleteMember = () => {
  const invalidate = useInvalidateMembers();
  return useMutation({ mutationFn: (id: string) => deleteRequest(`/members/${id}`), onSuccess: invalidate });
};

export const useIssueAccessLink = () => useMutation({ mutationFn: (id: string) => postData<AccessLink>(`/members/${id}/access-link`) });

export const useChangeRole = (id: string) => {
  const invalidate = useInvalidateMembers();
  return useMutation({ mutationFn: (role: Role) => patchData<Member>(`/members/${id}/role`, { role }), onSuccess: invalidate });
};

export const useChangeAccountStatus = (id: string) => {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (status: 'ACTIVE' | 'DISABLED') => patchData<Member>(`/members/${id}/account-status`, { status }),
    onSuccess: invalidate,
  });
};
