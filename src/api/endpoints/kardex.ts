// Kardex: movimientos de inventario
import { peticion } from '../client';
import type { Envoltorio, FiltrosKardex, MovimientoKardex, Paginado } from '../tipos';

export const kardexKeys = {
  todo: ['kardex'] as const,
  lista: (filtros: FiltrosKardex = {}) => ['kardex', 'lista', filtros] as const,
  detalle: (id: number) => ['kardex', 'detalle', id] as const,
};

export function listarMovimientos(
  filtros: FiltrosKardex = {},
  signal?: AbortSignal,
): Promise<Paginado<MovimientoKardex>> {
  return peticion('/kardex', { query: filtros, ...(signal ? { signal } : {}) });
}

export async function obtenerMovimiento(
  id: number,
  signal?: AbortSignal,
): Promise<MovimientoKardex> {
  const r = await peticion<Envoltorio<MovimientoKardex>>(`/kardex/${id}`, signal ? { signal } : {});
  return r.data;
}
