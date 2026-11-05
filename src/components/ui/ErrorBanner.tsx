import { mensajeDeError } from '../../api/errores';
import { Button } from './Button';

interface Props {
  error: unknown;
  /** Título opcional sobre el mensaje. */
  titulo?: string;
  onReintentar?: () => void;
}

export function ErrorBanner({ error, titulo, onReintentar }: Props) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
    >
      <div>
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        <p>{mensajeDeError(error)}</p>
      </div>
      {onReintentar ? (
        <Button variante="secundario" tamano="sm" onClick={onReintentar}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
