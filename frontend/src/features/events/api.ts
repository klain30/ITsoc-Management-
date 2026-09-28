import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, deleteRequest, getData, getPage, patchData, postData, putData } from '@/lib/api';
import type {
  AttendanceSession,
  AttendanceStatus,
  CheckInResult,
  EventAttendance,
  EventItem,
  EventStatus,
  Paginated,
  Registration,
  SessionQr,
} from '@/types/api';

export type EventFilters = {
  page: number;
  search?: string;
  status?: EventStatus | '';
  timeframe: 'upcoming' | 'past' | 'all';
  mine?: boolean;
};

export type EventInput = {
  name: string;
  description?: string | null;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  registrationDeadline: string;
};

export const eventKeys = {
  all: ['events'] as const,
  list: (filters: EventFilters) => ['events', 'list', filters] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  registrations: (id: string) => ['events', 'registrations', id] as const,
  attendance: (id: string) => ['events', 'attendance', id] as const,
  sessions: (id: string) => ['events', 'sessions', id] as const,
};

export const useEvents = (filters: EventFilters) =>
  useQuery({
    queryKey: eventKeys.list(filters),
    queryFn: () =>
      getPage<Paginated<EventItem>>('/events', {
        params: { ...filters, status: filters.status || undefined, search: filters.search || undefined, pageSize: 12 },
      }),
    placeholderData: keepPreviousData,
  });

export const useEvent = (id: string) => useQuery({ queryKey: eventKeys.detail(id), queryFn: () => getData<EventItem>(`/events/${id}`) });

export const useRegistrations = (id: string, enabled: boolean) =>
  useQuery({ queryKey: eventKeys.registrations(id), queryFn: () => getData<Registration[]>(`/events/${id}/registrations`), enabled });

export const useEventAttendance = (id: string, enabled: boolean) =>
  useQuery({ queryKey: eventKeys.attendance(id), queryFn: () => getData<EventAttendance>(`/events/${id}/attendance`), enabled });

export const useAttendanceSessions = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: eventKeys.sessions(id),
    queryFn: () => getData<AttendanceSession[]>(`/events/${id}/attendance-sessions`),
    enabled,
    refetchInterval: 15_000,
  });

/** Invalidates everything about one event after a change. */
const useInvalidateEvent = () => {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['events', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    if (id) {
      void queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.registrations(id) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.attendance(id) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.sessions(id) });
    }
  };
};

export const useCreateEvent = () => {
  const invalidate = useInvalidateEvent();
  return useMutation({ mutationFn: (input: EventInput) => postData<EventItem>('/events', input), onSuccess: () => invalidate() });
};

export const useUpdateEvent = (id: string) => {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (input: Partial<EventInput>) => patchData<EventItem>(`/events/${id}`, input),
    onSuccess: () => invalidate(id),
  });
};

export const useChangeEventStatus = (id: string) => {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (status: EventStatus) => patchData<EventItem>(`/events/${id}/status`, { status }),
    onSuccess: () => invalidate(id),
  });
};

export const useRegister = (id: string) => {
  const invalidate = useInvalidateEvent();
  return useMutation({ mutationFn: () => postData(`/events/${id}/register`), onSuccess: () => invalidate(id) });
};

export const useCancelRegistration = (id: string) => {
  const invalidate = useInvalidateEvent();
  return useMutation({ mutationFn: () => deleteRequest(`/events/${id}/register`), onSuccess: () => invalidate(id) });
};

export const useOpenSession = (eventId: string) => {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: (input: { name?: string }) => postData<AttendanceSession>(`/events/${eventId}/attendance-sessions`, input),
    onSuccess: () => invalidate(eventId),
  });
};

export const useCloseSession = (eventId: string) => {
  const invalidate = useInvalidateEvent();
  return useMutation({ mutationFn: (sessionId: string) => api.patch(`/attendance-sessions/${sessionId}/close`), onSuccess: () => invalidate(eventId) });
};

export const useSetAttendance = (eventId: string) => {
  const invalidate = useInvalidateEvent();
  return useMutation({
    mutationFn: ({ memberId, status, note }: { memberId: string; status: AttendanceStatus; note: string }) =>
      putData(`/events/${eventId}/attendance/${memberId}`, { status, note }),
    onSuccess: () => invalidate(eventId),
  });
};

export const useIssueCertificates = (eventId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postData<{ issued: number }>(`/events/${eventId}/certificates`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['certificates'] }),
  });
};

export const useSessionQr = (sessionId: string) =>
  useQuery({
    queryKey: ['attendance-session', sessionId, 'qr'],
    queryFn: () => getData<SessionQr>(`/attendance-sessions/${sessionId}/qr`),
    retry: false,
    refetchOnWindowFocus: false,
  });

export const checkIn = (code: string) => postData<CheckInResult>('/attendance/check-in', { code });
