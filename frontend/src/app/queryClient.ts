import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retry only transient failures; a 403/404/422 will not fix itself.
      retry: (failureCount, error) => {
        const status = error instanceof ApiError ? error.status : 0;
        return (status === 0 || status >= 500) && failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
