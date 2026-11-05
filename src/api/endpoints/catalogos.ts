// Catálogos: bodegas y productos
import { peticion } from '../client';
import type { Bodega, Paginado, ParamsPaginacion, Producto } from '../tipos';

export const catalogosKeys = {
  todo: ['catalogos'] as const,
  bodegas: (page = 1) => ['catalogos', 'bodegas', page] as const,
  productos: (params: ParamsPaginacion = {}) => ['catalogos', 'productos', params] as const,
};

/** Paginado fijo de 25; solo acepta `page`. */
export function listarBodegas(page = 1, signal?: AbortSignal): Promise<Paginado<Bodega>> {
  return peticion('/bodegas', { query: { page }, ...(signal ? { signal } : {}) });
}

export function listarProductos(
  params: ParamsPaginacion = {},
  signal?: AbortSignal,
): Promise<Paginado<Producto>> {
  return peticion('/productos', { query: params, ...(signal ? { signal } : {}) });
}
