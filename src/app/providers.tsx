import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { esApiError } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';

/** No reintenta errores 4xx ni de red controlados por el cliente. */
export function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (fallos, error) => {
          if (esApiError(error) && error.status >= 400 && error.status < 500) return false;
          return fallos < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(crearQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  );
}
