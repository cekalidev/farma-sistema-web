import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma';
type Tamano = 'sm' | 'md';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-700 text-white hover:bg-marca-800 disabled:bg-marca-700/60',
  secundario:
    'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 disabled:text-slate-400',
  peligro: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/60',
  fantasma: 'text-slate-700 hover:bg-slate-200/70 disabled:text-slate-400',
};

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: Tamano;
  /** En curso: deshabilitado, aria-busy y spinner. */
  pending?: boolean;
}

export function Button({
  variante = 'primario',
  tamano = 'md',
  pending = false,
  disabled,
  type = 'button',
  className = '',
  children,
  ...resto
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
      {...resto}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}
