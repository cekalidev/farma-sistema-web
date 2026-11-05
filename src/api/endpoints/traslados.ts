// Traslados entre bodegas y discrepancias
import { peticion } from '../client';
import type {
  Discrepancia,
  Envoltorio,
  FiltrosTraslados,
  ItemTrasladoNuevo,
  NuevoTraslado,
  Paginado,
  RecepcionTraslado,
  ResolucionDiscrepancia,
  Traslado,
} from '../tipos';

export const trasladosKeys = {
  todo: ['traslados'] as const,
  lista: (filtros: FiltrosTraslados = {}) => ['traslados', 'lista', filtros] as const,
  detalle: (id: number) => ['traslados', 'detalle', id] as const,
};

export function listarTraslados(
  filtros: FiltrosTraslados = {},
  signal?: AbortSignal,
): Promise<Paginado<Traslado>> {
  return peticion('/traslados', { query: filtros, ...(signal ? { signal } : {}) });
}

export async function obtenerTraslado(id: number, signal?: AbortSignal): Promise<Traslado> {
  const r = await peticion<Envoltorio<Traslado>>(`/traslados/${id}`, signal ? { signal } : {});
  return r.data;
}

/** Crea en BORRADOR (1..50 ítems). */
export async function crearTraslado(datos: NuevoTraslado): Promise<Traslado> {
  const r = await peticion<Envoltorio<Traslado>>('/traslados', { method: 'POST', body: datos });
  return r.data;
}

/** Reemplaza los ítems (solo el creador, en BORRADOR). */
export async function actualizarItemsTraslado(
  id: number,
  items: ItemTrasladoNuevo[],
): Promise<Traslado> {
  const r = await peticion<Envoltorio<Traslado>>(`/traslados/${id}/items`, {
    method: 'PUT',
    body: { items },
  });
  return r.data;
}

export type AccionTrasladoSinCuerpo = 'solicitar' | 'aprobar' | 'despachar';

async function accionSinCuerpo(id: number, accion: AccionTrasladoSinCuerpo): Promise<Traslado> {
  const r = await peticion<Envoltorio<Traslado>>(`/traslados/${id}/${accion}`, { method: 'POST' });
  return r.data;
}

export const solicitarTraslado = (id: number) => accionSinCuerpo(id, 'solicitar');
export const aprobarTraslado = (id: number) => accionSinCuerpo(id, 'aprobar');
export const despacharTraslado = (id: number) => accionSinCuerpo(id, 'despachar');

/** Debe incluir TODOS los ítems (0..despachada). */
export async function recibirTraslado(id: number, datos: RecepcionTraslado): Promise<Traslado> {
  const r = await peticion<Envoltorio<Traslado>>(`/traslados/${id}/recibir`, {
    method: 'POST',
    body: datos,
  });
  return r.data;
}

export async function anularTraslado(id: number, motivo: string): Promise<Traslado> {
  const r = await peticion<Envoltorio<Traslado>>(`/traslados/${id}/anular`, {
    method: 'POST',
    body: { motivo },
  });
  return r.data;
}

/** Motivo 10..400 sin saltos de línea. */
export async function resolverDiscrepancia(
  id: number,
  datos: ResolucionDiscrepancia,
): Promise<Discrepancia> {
  const r = await peticion<Envoltorio<Discrepancia>>(`/discrepancias/${id}/resolver`, {
    method: 'POST',
    body: datos,
  });
  return r.data;
}
