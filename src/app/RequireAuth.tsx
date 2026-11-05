import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Cargando } from '../components/ui/Cargando';

/** Exige sesión; si no hay, va a /login recordando la ruta pedida. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();
  if (cargando) return <Cargando texto="Validando sesión…" />;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location }} />;
  return children;
}
