import { Outlet } from 'react-router';
import { puedeVerSeccion, type Seccion } from '../auth/permisos';
import { useAuth } from '../auth/useAuth';

/** Muestra la sección solo si el usuario tiene alguna de sus habilidades. */
export function RutaConPermiso({ seccion }: { seccion: Seccion }) {
  const { usuario } = useAuth();
  if (!puedeVerSeccion(usuario, seccion)) {
    return (
      <div
        role="alert"
        className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900"
      >
        <p className="font-semibold">Sin permiso</p>
        <p className="text-sm">Tu rol no tiene acceso a esta sección.</p>
      </div>
    );
  }
  return <Outlet />;
}
