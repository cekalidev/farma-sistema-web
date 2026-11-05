// Confirmación simple (sin motivo) sobre Dialogo
import { useRef, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialogo } from './Dialogo';
import { ErrorBanner } from './ErrorBanner';

export interface DialogoConfirmarProps {
  abierto: boolean;
  titulo: string;
  /** Qué va a pasar y sus consecuencias. */
  texto: ReactNode;
  etiquetaConfirmar?: string;
  etiquetaCancelar?: string;
  /** `peligro`: el foco inicial va a Cancelar para no confirmar por accidente. */
  variante?: 'primario' | 'peligro';
  /** Acción en curso: spinner en Confirmar y Escape bloqueado. */
  pending?: boolean;
  /** Error del último intento (se muestra con mensajeDeError). */
  error?: unknown;
  onConfirmar: () => void;
  onCerrar: () => void;
}

export function DialogoConfirmar({
  abierto,
  titulo,
  texto,
  etiquetaConfirmar = 'Confirmar',
  etiquetaCancelar = 'Cancelar',
  variante = 'primario',
  pending = false,
  error,
  onConfirmar,
  onCerrar,
}: DialogoConfirmarProps) {
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion={texto}
      bloquearCierre={pending}
      focoInicial={variante === 'peligro' ? cancelarRef : confirmarRef}
      acciones={
        <>
          <Button ref={cancelarRef} variante="secundario" onClick={onCerrar} disabled={pending}>
            {etiquetaCancelar}
          </Button>
          <Button ref={confirmarRef} variante={variante} pending={pending} onClick={onConfirmar}>
            {etiquetaConfirmar}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner error={error} /> : null}
    </Dialogo>
  );
}
