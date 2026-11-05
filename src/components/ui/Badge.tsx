// Insignias de estado
import type { ReactNode } from 'react';

type Tono = 'gris' | 'azul' | 'verde' | 'ambar' | 'rojo' | 'violeta';

const TONOS: Record<Tono, string> = {
  gris: 'bg-slate-100 text-slate-700 ring-slate-300',
  azul: 'bg-sky-50 text-sky-800 ring-sky-300',
  verde: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-300',
  rojo: 'bg-red-50 text-red-800 ring-red-300',
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
  vencido: { texto: 'Vencido', tono: 'rojo' },
  'por vencer': { texto: 'Por vencer', tono: 'ambar' },
};

export function Badge({ tono = 'gris', children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}

export function EstadoBadge({ estado }: { estado: EstadoBadge }) {
  const e = ESTADOS[estado];
  return <Badge tono={e.tono}>{e.texto}</Badge>;
}
