// Dispensaciones
import { peticion, peticionConMeta } from '../client';
import type {
  Dispensacion,
  Envoltorio,
  FiltrosDispensaciones,
  Paginado,
  Previsualizacion,
  SolicitudDispensacion,
} from '../tipos';

export const dispensacionesKeys = {
  todo: ['dispensaciones'] as const,
  lista: (filtros: FiltrosDispensaciones = {}) => ['dispensaciones', 'lista', filtros] as const,
  detalle: (id: number) => ['dispensaciones', 'detalle', id] as const,
};

/** Solo las claves que acepta el backend (evita IDEMPOTENCY_KEY_REUTILIZADA por campos extra). */
function cuerpo(s: SolicitudDispensacion): SolicitudDispensacion {
  return {
    paciente_id: s.paciente_id,
    prescripcion_id: s.prescripcion_id,
    bodega_id: s.bodega_id,
    items: s.items.map((i) => ({
      prescripcion_item_id: i.prescripcion_item_id,
      cantidad: i.cantidad,
    })),
  };
}

/** Asignación FEFO orientativa (sin Idempotency-Key, no mueve stock). */
export async function previsualizarDispensacion(
  solicitud: SolicitudDispensacion,
): Promise<Previsualizacion> {
  const r = await peticion<Envoltorio<Previsualizacion>>('/dispensaciones/previsualizar', {
    method: 'POST',
    body: cuerpo(solicitud),
  });
  return r.data;
}

/**
 * Crea la dispensación. `idempotencyKey` (UUID) debe mantenerse en los reintentos del
 * mismo envío. `replayed` = true si el backend devolvió el original.
 */
export async function crearDispensacion(
  solicitud: SolicitudDispensacion,
  idempotencyKey: string,
): Promise<{ dispensacion: Dispensacion; replayed: boolean }> {
  const r = await peticionConMeta<Envoltorio<Dispensacion>>('/dispensaciones', {
    method: 'POST',
    body: cuerpo(solicitud),
    idempotencyKey,
  });
  return { dispensacion: r.data.data, replayed: r.replayed };
}

/** Regente distinto de quien dispensó. */
export async function autorizarDispensacion(id: number): Promise<Dispensacion> {
  const r = await peticion<Envoltorio<Dispensacion>>(`/dispensaciones/${id}/autorizar`, {
    method: 'POST',
  });
  return r.data;
}

/** Regente distinto de quien dispensó. Motivo 10..500 sin saltos de línea. */
export async function rechazarDispensacion(id: number, motivo: string): Promise<Dispensacion> {
  const r = await peticion<Envoltorio<Dispensacion>>(`/dispensaciones/${id}/rechazar`, {
    method: 'POST',
    body: { motivo },
  });
  return r.data;
}

/** Fila del listado: el recurso más quien dispensó y SIN paciente (solo `paciente_id`). */
export type DispensacionListado = Dispensacion & {
  dispensado_por?: { id: number; nombre: string };
};

/**
 * Listado paginado (`created_at` ascendente, desempate por id). Anunciado en el contrato pero
 * aún no publicado: si responde 404/405, la UI degrada (ver PanelPendientes).
 */
export function listarDispensaciones(
  filtros: FiltrosDispensaciones = {},
  signal?: AbortSignal,
): Promise<Paginado<DispensacionListado>> {
  return peticion('/dispensaciones', { query: filtros, ...(signal ? { signal } : {}) });
}

/** Detalle con el paciente anidado (enmascarado para el auditor). */
export async function obtenerDispensacion(id: number, signal?: AbortSignal): Promise<Dispensacion> {
  const r = await peticion<Envoltorio<Dispensacion>>(
    `/dispensaciones/${id}`,
    signal ? { signal } : {},
  );
  return r.data;
}
