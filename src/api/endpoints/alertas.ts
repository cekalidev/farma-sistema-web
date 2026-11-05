// Alertas de vencimiento y stock mínimo (RN-11, contrato §4.8): listados paginados con meta.hoy
import { peticion } from '../client';
import type { AlertaStockMinimo, AlertasPaginadas, AlertaVencimiento } from '../tipos';

/** El panel pide una sola página grande (máximo del contrato). */
export const POR_PAGINA_ALERTAS = 100;

export const alertasKeys = {
  todo: ['alertas'] as const,
  vencimientos: (bodegaId?: number) => ['alertas', 'vencimientos', bodegaId ?? null] as const,
  stockMinimo: (bodegaId?: number) => ['alertas', 'stock-minimo', bodegaId ?? null] as const,
};

export function listarAlertasVencimiento(
  bodegaId?: number,
  signal?: AbortSignal,
): Promise<AlertasPaginadas<AlertaVencimiento>> {
  return peticion('/alertas/vencimientos', {
    query: { bodega_id: bodegaId, por_pagina: POR_PAGINA_ALERTAS },
    ...(signal ? { signal } : {}),
  });
}

export function listarAlertasStockMinimo(
  bodegaId?: number,
  signal?: AbortSignal,
): Promise<AlertasPaginadas<AlertaStockMinimo>> {
  return peticion('/alertas/stock-minimo', {
    query: { bodega_id: bodegaId, por_pagina: POR_PAGINA_ALERTAS },
    ...(signal ? { signal } : {}),
  });
}

/** Solo las filas de la primera página (compatibilidad). */
export async function alertasVencimiento(
  bodegaId?: number,
  signal?: AbortSignal,
): Promise<AlertaVencimiento[]> {
  return (await listarAlertasVencimiento(bodegaId, signal)).data;
}

/** Solo las filas de la primera página (compatibilidad). */
export async function alertasStockMinimo(
  bodegaId?: number,
  signal?: AbortSignal,
): Promise<AlertaStockMinimo[]> {
  return (await listarAlertasStockMinimo(bodegaId, signal)).data;
}
