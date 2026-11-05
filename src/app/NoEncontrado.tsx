import { Link } from 'react-router';
import { EstadoVacio } from '../components/ui/EstadoVacio';

export function NoEncontrado() {
  return (
    <EstadoVacio titulo="Página no encontrada">
      <Link to="/" className="text-marca-700 underline">
        Ir al inicio
      </Link>
    </EstadoVacio>
  );
}
