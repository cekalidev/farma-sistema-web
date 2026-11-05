import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Cargando } from '../components/ui/Cargando';
import { ErrorBanner } from '../components/ui/ErrorBanner';

/** Exige sesión; si no hay, va a /login recordando la ruta pedida. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { usuario, cargando, errorSesion, reintentarSesion } = useAuth();
  const location = useLocation();
  if (cargando) return <Cargando texto="Validando sesión…" />;
  // Fallo de red/servidor al validar: no se manda al login (el token sigue siendo válido)
  if (!usuario && errorSesion) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <ErrorBanner
          titulo="No se pudo validar la sesión"
          error={errorSesion}
          onReintentar={reintentarSesion}
        />
      </div>
    );
  }
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location }} />;
  return children;
}
