// Estado y textos de vencimiento de una existencia
import type { ComponentProps } from 'react';
import type { Existencia } from '../../api/tipos';
import type { Badge } from '../../components/ui/Badge';
import { DIAS_POR_VENCER, diasHastaVencer } from '../../lib/fechas';

type Tono = NonNullable<ComponentProps<typeof Badge>['tono']>;

export interface EstadoExistencia {
  texto: 'Vencido' | 'Por vencer' | 'Sin stock' | 'OK';
  tono: Tono;
}

export function estadoExistencia(e: Existencia, hoy: Date = new Date()): EstadoExistencia {
  if (e.vencido) return { texto: 'Vencido', tono: 'rojo' };
  if (diasHastaVencer(e.fecha_vencimiento, hoy) <= DIAS_POR_VENCER) {
    return { texto: 'Por vencer', tono: 'ambar' };
  }
  if (e.cantidad === 0) return { texto: 'Sin stock', tono: 'gris' };
  return { texto: 'OK', tono: 'verde' };
}

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

/** "vence en N días", "vence hoy" o "vencido hace N días". */
export function textoDias(diasRestantes: number): string {
  if (diasRestantes === 0) return 'vence hoy';
  return diasRestantes > 0
    ? `vence en ${dias(diasRestantes)}`
    : `vencido hace ${dias(-diasRestantes)}`;
}
