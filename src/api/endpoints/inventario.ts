// Inventario: existencias, entradas y ajustes
import { peticion } from '../client';
import type {
  AjusteInventario,
  EntradaInventario,
  Envoltorio,
  Existencia,
  FiltrosInventario,
  MovimientoKardex,
  Paginado,
  ResultadoEntrada,
} from '../tipos';

export const inventarioKeys = {
  todo: ['inventario'] as const,
  lista: (filtros: FiltrosInventario = {}) => ['inventario', 'lista', filtros] as const,
};

export function listarExistencias(
  filtros: FiltrosInventario = {},
  signal?: AbortSignal,
): Promise<Paginado<Existencia>> {
  return peticion('/inventario', { query: filtros, ...(signal ? { signal } : {}) });
}

/** Solo regente (inventario.registrar). */
export async function registrarEntrada(datos: EntradaInventario): Promise<ResultadoEntrada> {
  const r = await peticion<Envoltorio<ResultadoEntrada>>('/inventario/entradas', {
    method: 'POST',
    body: datos,
  });
  return r.data;
}

/** Solo regente (inventario.registrar). Cantidad con signo, distinta de 0. */
export async function registrarAjuste(datos: AjusteInventario): Promise<MovimientoKardex> {
  const r = await peticion<Envoltorio<MovimientoKardex>>('/inventario/ajustes', {
    method: 'POST',
    body: datos,
  });
  return r.data;
}
