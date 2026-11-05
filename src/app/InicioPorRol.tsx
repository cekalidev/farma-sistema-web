import { Navigate } from 'react-router';
import { rutaInicio } from '../auth/permisos';
import { useAuth } from '../auth/useAuth';
import { EstadoVacio } from '../components/ui/EstadoVacio';

export function InicioPorRol() {
  const { usuario } = useAuth();
  const destino = rutaInicio(usuario);
  if (destino) return <Navigate to={destino} replace />;
  return (
    <EstadoVacio titulo="Tu rol no tiene pantallas en este módulo">
      Este módulo es para farmacia, inventario y traslados.
    </EstadoVacio>
  );
}
