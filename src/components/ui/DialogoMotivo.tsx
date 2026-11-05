// Diálogo para capturar un motivo (anular, rechazar, ajustar, resolver discrepancia)
import { useId, useRef, useState } from 'react';
import { Button } from './Button';
import { Dialogo } from './Dialogo';
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

export interface DialogoMotivoProps {
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

/** Cada apertura empieza en limpio: motivo, validación y error del servidor se reinician. */
export function DialogoMotivo({
  abierto,
  titulo,
  descripcion,
  etiquetaConfirmar = 'Confirmar',
  variante = 'peligro',
  maximo = MOTIVO_MAX,
  onConfirmar,
  onCerrar,
}: DialogoMotivoProps) {
  const id = useId();
  const [motivo, setMotivo] = useState('');
  const [tocado, setTocado] = useState(false);
  const [errorServidor, setErrorServidor] = useState<unknown>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Reinicio al abrir (ajuste de estado durante el render, sin efecto)
  const [abiertoAntes, setAbiertoAntes] = useState(abierto);
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto);
    if (abierto) {
      setMotivo('');
      setTocado(false);
      setErrorServidor(null);
    }
  }

  const { ejecutar, pendiente } = useAccionUnica(async () => {
    setErrorServidor(null);
    try {
      await onConfirmar(motivo.trim());
      onCerrar();
    } catch (e) {
      setErrorServidor(e);
    }
  });

  const error = validarMotivo(motivo, maximo);
  const mostrarError = tocado && error;

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion={descripcion}
      focoInicial={areaRef}
      bloquearCierre={pendiente}
    >
      <form
        className="flex flex-col gap-3"
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
            className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm aria-[invalid=true]:border-peligro-600"
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
            className={`text-xs ${mostrarError ? 'font-medium text-peligro-700' : 'text-slate-500'}`}
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button variante="secundario" onClick={onCerrar} disabled={pendiente}>
            Cancelar
          </Button>
          <Button type="submit" variante={variante} pending={pendiente}>
            {etiquetaConfirmar}
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
