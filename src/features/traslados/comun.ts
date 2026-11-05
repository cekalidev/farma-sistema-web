// Utilidades compartidas por las pantallas de traslados
import { useQuery } from '@tanstack/react-query';
import { catalogosKeys, listarBodegas } from '../../api/endpoints/catalogos';
import type { EstadoTraslado, TipoResolucion, Usuario } from '../../api/tipos';

export const ESTADOS_TRASLADO: { valor: EstadoTraslado; texto: string }[] = [
  { valor: 'BORRADOR', texto: 'Borrador' },
  { valor: 'SOLICITADO', texto: 'Solicitado' },
  { valor: 'APROBADO', texto: 'Aprobado' },
  { valor: 'EN_TRANSITO', texto: 'En tránsito' },
  { valor: 'RECIBIDO', texto: 'Recibido' },
  { valor: 'RECIBIDO_PARCIAL', texto: 'Recibido parcial' },
  { valor: 'ANULADO', texto: 'Anulado' },
];

export function esEstadoTraslado(v: string | null): v is EstadoTraslado {
  return ESTADOS_TRASLADO.some((e) => e.valor === v);
}

export const TIPOS_RESOLUCION: { valor: TipoResolucion; texto: string; ayuda: string }[] = [
  { valor: 'PERDIDA', texto: 'Pérdida', ayuda: 'Se da por perdida: no mueve stock.' },
  {
    valor: 'REINTEGRO_ORIGEN',
    texto: 'Reintegro al origen',
    ayuda: 'Las unidades vuelven al inventario de la bodega de origen.',
  },
  {
    valor: 'ENTREGA_DESTINO',
    texto: 'Entrega en destino',
    ayuda: 'Las unidades llegaron después: entran al inventario de la bodega de destino.',
  },
];

export const textoTipoResolucion = (t: TipoResolucion | null) =>
  TIPOS_RESOLUCION.find((x) => x.valor === t)?.texto ?? '—';

/** "Tú" si es el usuario actual; si no, "Usuario #id". */
export function quien(id: number | null, actual: Usuario | null): string {
  if (id === null) return '—';
  return actual?.id === id ? 'Tú' : `Usuario #${id}`;
}

/** Bodegas (catálogo pequeño, una página de 25). */
export function useBodegas() {
  return useQuery({
    queryKey: catalogosKeys.bodegas(1),
    queryFn: ({ signal }) => listarBodegas(1, signal),
    staleTime: 5 * 60_000,
    select: (r) => r.data,
  });
}
