import type { ComponentProps, MouseEvent } from 'react';
import { Spinner } from './Spinner';

export type VarianteBoton =
  | 'primario'
  | 'secundario'
  | 'peligro'
  | 'peligroSecundario'
  | 'fantasma';
type Tamano = 'sm' | 'md';

// `aria-disabled:` cubre el estado pending (sigue enfocable); `disabled:` el deshabilitado real
const VARIANTES: Record<VarianteBoton, string> = {
  primario:
    'bg-marca-700 text-white hover:bg-marca-800 disabled:bg-marca-700/60 aria-disabled:bg-marca-700/80',
  secundario:
    'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 disabled:text-slate-400',
  peligro:
    'bg-peligro-700 text-white hover:bg-peligro-800 disabled:bg-peligro-700/60 aria-disabled:bg-peligro-700/80',
  /** Acción destructiva no principal: borde y texto rojos sobre blanco. */
  peligroSecundario:
    'bg-white text-peligro-700 border border-peligro-300 hover:bg-peligro-50 hover:border-peligro-600 disabled:text-peligro-700/50 disabled:border-peligro-300/60',
  fantasma: 'text-slate-700 hover:bg-slate-200/70 disabled:text-slate-400',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variante?: VarianteBoton;
  tamano?: Tamano;
  /**
   * En curso: spinner, `aria-busy` y `aria-disabled` (NO `disabled`, para no perder el foco
   * del teclado). Mientras tanto no dispara `onClick` ni envía el formulario.
   */
  pending?: boolean;
}

export function Button({
  variante = 'primario',
  tamano = 'md',
  pending = false,
  disabled,
  type = 'button',
  className = '',
  onClick,
  children,
  ...resto
}: ButtonProps) {
  const alPulsar = (e: MouseEvent<HTMLButtonElement>) => {
    if (pending) {
      // También evita el envío implícito del formulario (type="submit" o Enter)
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={pending && !disabled ? true : undefined}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed aria-disabled:cursor-progress ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
      onClick={alPulsar}
      {...resto}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}
