import type { ReactNode } from 'react';
import { esApiError } from '../../api/client';
import { mensajeDeError } from '../../api/errores';
import { Button } from './Button';

interface Props {
  error: unknown;
  /** Título opcional sobre el mensaje. */
  titulo?: string;
  /**
   * Detalle adicional bajo el mensaje, p. ej. los errores de campo que el formulario no
   * pinta: `extra={resumenErroresNoAplicados(noAplicados)}`.
   */
  extra?: ReactNode;
  onReintentar?: () => void;
}

export function ErrorBanner({ error, titulo, extra, onReintentar }: Props) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-md border border-peligro-300 bg-peligro-50 px-3 py-2 text-sm text-peligro-900"
    >
      <div className="min-w-0">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        <p>{mensajeDeError(error)}</p>
        {extra ? <div className="mt-1">{extra}</div> : null}
        {esApiError(error) && error.correlacionId ? (
          <p className="mt-1 text-xs text-peligro-800">
            Código de seguimiento:{' '}
            <span className="font-mono select-all">{error.correlacionId}</span>
          </p>
        ) : null}
      </div>
      {onReintentar ? (
        <Button variante="secundario" tamano="sm" onClick={onReintentar}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
