// Insignias de estado
import type { ReactNode } from 'react';

export type Tono = 'gris' | 'azul' | 'verde' | 'ambar' | 'rojo' | 'violeta';

const TONOS: Record<Tono, string> = {
  gris: 'bg-slate-100 text-slate-700 ring-slate-300',
  azul: 'bg-sky-50 text-sky-800 ring-sky-300',
  verde: 'bg-ok-50 text-ok-800 ring-ok-300',
  ambar: 'bg-aviso-50 text-aviso-800 ring-aviso-300',
  rojo: 'bg-peligro-50 text-peligro-800 ring-peligro-300',
  violeta: 'bg-violet-50 text-violet-800 ring-violet-300',
};

export type EstadoBadge =
  | 'BORRADOR'
  | 'SOLICITADO'
  | 'APROBADO'
  | 'EN_TRANSITO'
  | 'RECIBIDO'
  | 'RECIBIDO_PARCIAL'
  | 'ANULADO'
  | 'CONFIRMADA'
  | 'PENDIENTE_AUTORIZACION'
  | 'RECHAZADA'
  // Discrepancia de traslado
  | 'PENDIENTE'
  | 'RESUELTA'
  | 'vencido'
  | 'por vencer';

const ESTADOS: Record<EstadoBadge, { texto: string; tono: Tono }> = {
  BORRADOR: { texto: 'Borrador', tono: 'gris' },
  SOLICITADO: { texto: 'Solicitado', tono: 'azul' },
  APROBADO: { texto: 'Aprobado', tono: 'violeta' },
  EN_TRANSITO: { texto: 'En tránsito', tono: 'ambar' },
  RECIBIDO: { texto: 'Recibido', tono: 'verde' },
  RECIBIDO_PARCIAL: { texto: 'Recibido parcial', tono: 'ambar' },
  ANULADO: { texto: 'Anulado', tono: 'rojo' },
  CONFIRMADA: { texto: 'Confirmada', tono: 'verde' },
  PENDIENTE_AUTORIZACION: { texto: 'Pendiente de autorización', tono: 'ambar' },
  RECHAZADA: { texto: 'Rechazada', tono: 'rojo' },
  PENDIENTE: { texto: 'Pendiente', tono: 'ambar' },
  RESUELTA: { texto: 'Resuelta', tono: 'verde' },
  vencido: { texto: 'Vencido', tono: 'rojo' },
  'por vencer': { texto: 'Por vencer', tono: 'ambar' },
};

export type TamanoBadge = 'sm' | 'lg';

const TAMANOS: Record<TamanoBadge, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

interface BadgeProps {
  tono?: Tono;
  tamano?: TamanoBadge;
  children: ReactNode;
}

export function Badge({ tono = 'gris', tamano = 'sm', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded font-medium whitespace-nowrap ring-1 ring-inset ${TAMANOS[tamano]} ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}

/** `tamano="lg"` para el estado principal en la cabecera de un detalle. */
export function EstadoBadge({
  estado,
  tamano = 'sm',
}: {
  estado: EstadoBadge;
  tamano?: TamanoBadge;
}) {
  const e = ESTADOS[estado];
  return (
    <Badge tono={e.tono} tamano={tamano}>
      {e.texto}
    </Badge>
  );
}
