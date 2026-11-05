// Paginación con la meta de Laravel
import type { MetaPaginacion } from '../../api/tipos';
import { Button } from './Button';

interface Props {
  meta: MetaPaginacion;
  onCambiar: (pagina: number) => void;
  /** Deshabilita mientras carga la página siguiente. */
  cargando?: boolean;
}

export function Paginacion({ meta, onCambiar, cargando = false }: Props) {
  const { current_page: actual, last_page: ultima, from, to, total } = meta;
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-2 py-2 text-sm">
      <p className="text-slate-600">
        {total === 0 ? 'Sin registros' : `${from ?? 0}–${to ?? 0} de ${total}`}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variante="secundario"
          tamano="sm"
          disabled={actual <= 1 || cargando}
          onClick={() => onCambiar(actual - 1)}
        >
          Anterior
        </Button>
        <span className="px-2 text-slate-600" aria-current="page">
          Página {actual} de {Math.max(ultima, 1)}
        </span>
        <Button
          variante="secundario"
          tamano="sm"
          disabled={actual >= ultima || cargando}
          onClick={() => onCambiar(actual + 1)}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
