// Alertas de vencimiento y stock mínimo (AÚN NO EXISTEN en el backend: mock MSW)
import { peticion } from '../client';
import type { AlertaStockMinimo, AlertaVencimiento, Envoltorio } from '../tipos';

export const alertasKeys = {
  todo: ['alertas'] as const,
  vencimientos: (bodegaId?: number) => ['alertas', 'vencimientos', bodegaId ?? null] as const,
  stockMinimo: (bodegaId?: number) => ['alertas', 'stock-minimo', bodegaId ?? null] as const,
};

export async function alertasVencimiento(
  bodegaId?: number,
  signal?: AbortSignal,
): Promise<AlertaVencimiento[]> {
  const r = await peticion<Envoltorio<AlertaVencimiento[]>>('/alertas/vencimientos', {
    query: { bodega_id: bodegaId },
    ...(signal ? { signal } : {}),
  });
  return r.data;
}

export async function alertasStockMinimo(
  bodegaId?: number,
  signal?: AbortSignal,
): Promise<AlertaStockMinimo[]> {
  const r = await peticion<Envoltorio<AlertaStockMinimo[]>>('/alertas/stock-minimo', {
    query: { bodega_id: bodegaId },
    ...(signal ? { signal } : {}),
  });
  return r.data;
}
