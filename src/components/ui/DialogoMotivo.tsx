// Diálogo para capturar un motivo (anular, rechazar, ajustar, resolver discrepancia)
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';
import { useAccionUnica } from './useAccionUnica';

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;
/** Máximo para resolver discrepancias. */
export const MOTIVO_MAX_DISCREPANCIA = 400;

/** Valida un motivo; devuelve el error o null. */
export function validarMotivo(motivo: string, max = MOTIVO_MAX): string | null {
  const limpio = motivo.trim();
  if (/[\r\n]/.test(motivo)) return 'El motivo no puede tener saltos de línea.';
  if (limpio.length < MOTIVO_MIN) return `Escribe al menos ${MOTIVO_MIN} caracteres.`;
  if (limpio.length > max) return `Máximo ${max} caracteres.`;
  return null;
}

interface Props {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  etiquetaConfirmar?: string;
  variante?: 'primario' | 'peligro';
  maximo?: number;
  /** Recibe el motivo ya recortado. Si lanza, el error se muestra en el diálogo. */
  onConfirmar: (motivo: string) => Promise<unknown>;
  onCerrar: () => void;
}

export function DialogoMotivo({
  abierto,
  titulo,
  descripcion,
  etiquetaConfirmar = 'Confirmar',
  variante = 'peligro',
  maximo = MOTIVO_MAX,
  onConfirmar,
  onCerrar,
}: Props) {
  const id = useId();
  const [motivo, setMotivo] = useState('');
  const [tocado, setTocado] = useState(false);
  const [errorServidor, setErrorServidor] = useState<unknown>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const previoRef = useRef<HTMLElement | null>(null);

  const { ejecutar, pendiente } = useAccionUnica(async () => {
    setErrorServidor(null);
    try {
      await onConfirmar(motivo.trim());
      setMotivo('');
      setTocado(false);
      onCerrar();
    } catch (e) {
      setErrorServidor(e);
    }
  });

  // Foco al abrir y devolución del foco al cerrar
  useEffect(() => {
    if (!abierto) return;
    previoRef.current = document.activeElement as HTMLElement | null;
    areaRef.current?.focus();
    return () => previoRef.current?.focus();
  }, [abierto]);

  if (!abierto) return null;

  const error = validarMotivo(motivo, maximo);
  const mostrarError = tocado && error;

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !pendiente) {
      e.stopPropagation();
      onCerrar();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onKeyDown={alTeclear}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={descripcion ? `${id}-desc` : undefined}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl"
      >
        <h2 id={`${id}-titulo`} className="text-base font-semibold">
          {titulo}
        </h2>
        {descripcion ? (
          <p id={`${id}-desc`} className="mt-1 text-sm text-slate-600">
            {descripcion}
          </p>
        ) : null}
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTocado(true);
            if (!error) void ejecutar();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-motivo`} className="text-sm font-medium text-slate-700">
              Motivo
            </label>
            <textarea
              ref={areaRef}
              id={`${id}-motivo`}
              rows={3}
              maxLength={maximo}
              value={motivo}
              aria-invalid={mostrarError ? true : undefined}
              aria-describedby={`${id}-ayuda`}
              className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm aria-[invalid=true]:border-red-600"
              onChange={(e) => setMotivo(e.target.value.replace(/[\r\n]+/g, ' '))}
              onKeyDown={(e) => {
                // Enter no inserta salto de línea: envía
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              onBlur={() => setTocado(true)}
            />
            <p
              id={`${id}-ayuda`}
              className={`text-xs ${mostrarError ? 'font-medium text-red-700' : 'text-slate-500'}`}
            >
              {mostrarError
                ? error
                : `Entre ${MOTIVO_MIN} y ${maximo} caracteres, en una sola línea.`}{' '}
              <span className="tabular-nums">
                ({motivo.trim().length}/{maximo})
              </span>
            </p>
          </div>
          {errorServidor ? <ErrorBanner error={errorServidor} /> : null}
          <div className="flex justify-end gap-2">
            <Button variante="secundario" onClick={onCerrar} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" variante={variante} pending={pendiente}>
              {etiquetaConfirmar}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
