// Diálogo modal accesible sobre <dialog> nativo: fondo inerte, Escape cierra (evento
// `cancel`), foco inicial configurable y foco devuelto al elemento que lo abrió.
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

const ENFOCABLES =
  '[autofocus], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const ANCHOS = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' } as const;

export interface DialogoProps {
  abierto: boolean;
  /** Escape o "Cancelar". El padre decide (normalmente `setAbierto(false)`). */
  onCerrar: () => void;
  titulo: ReactNode;
  descripcion?: ReactNode;
  children?: ReactNode;
  /** Botones del pie, alineados a la derecha. */
  acciones?: ReactNode;
  /** Recibe el foco al abrir. Por defecto: `[autofocus]` o el primer control. */
  focoInicial?: RefObject<HTMLElement | null>;
  /** Ignora Escape (p. ej. mientras se guarda). */
  bloquearCierre?: boolean;
  ancho?: keyof typeof ANCHOS;
}

/**
 * Cerrado no renderiza nada: el contenido se desmonta y su estado se reinicia en cada apertura.
 */
export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  acciones,
  focoInicial,
  bloquearCierre = false,
  ancho = 'md',
}: DialogoProps) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const focoInicialRef = useRef(focoInicial);
  useEffect(() => {
    focoInicialRef.current = focoInicial;
  });

  // Abre como modal y devuelve el foco al cerrar. El elemento previo se captura en el
  // propio efecto (no en un useState): en StrictMode el cleanup lo restaura y el segundo
  // montaje vuelve a capturarlo correctamente.
  useEffect(() => {
    const dlg = ref.current;
    if (!abierto || !dlg) return;
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dlg.open) dlg.showModal();
    const destino =
      focoInicialRef.current?.current ?? dlg.querySelector<HTMLElement>(ENFOCABLES) ?? dlg;
    destino.focus();
    return () => {
      if (dlg.open) dlg.close();
      if (previo?.isConnected) previo.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titulo`}
      aria-describedby={descripcion ? `${id}-desc` : undefined}
      tabIndex={-1}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${ANCHOS[ancho]} overflow-y-auto rounded-lg bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40`}
      onCancel={(e) => {
        // El estado lo controla React: nunca dejamos que el navegador lo cierre solo
        e.preventDefault();
        if (!bloquearCierre) onCerrar();
      }}
    >
      <div className="p-4">
        <h2 id={`${id}-titulo`} className="text-base font-semibold text-balance">
          {titulo}
        </h2>
        {descripcion ? (
          <div id={`${id}-desc`} className="mt-1 text-sm text-slate-600">
            {descripcion}
          </div>
        ) : null}
        {children ? <div className="mt-3">{children}</div> : null}
        {acciones ? <div className="mt-4 flex flex-wrap justify-end gap-2">{acciones}</div> : null}
      </div>
    </dialog>
  );
}
