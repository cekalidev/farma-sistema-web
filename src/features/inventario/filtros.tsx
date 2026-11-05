// Filtros por URL y selects de bodega/producto/lote (los reutiliza Kardex)
import { useQuery } from '@tanstack/react-query';
import { catalogosKeys, listarBodegas, listarProductos } from '../../api/endpoints/catalogos';
import { inventarioKeys, listarExistencias } from '../../api/endpoints/inventario';
import type { Existencia, LoteResumen, Paginado } from '../../api/tipos';
import { Field, Select } from '../../components/ui/Field';
import { formatearFecha } from '../../lib/fechas';

export type Cambios = Record<string, string | number | null | undefined>;

/** Id positivo de la query string o undefined. */
export function leerId(params: URLSearchParams, clave: string): number | undefined {
  const v = params.get(clave);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha `Y-m-d` de la query string o undefined. */
export function leerFecha(params: URLSearchParams, clave: string): string | undefined {
  const v = params.get(clave);
  return v && RE_FECHA.test(v) ? v : undefined;
}

/** Copia de los params con los cambios aplicados; quita vacíos y vuelve a la página 1. */
export function aplicarCambios(previos: URLSearchParams, cambios: Cambios): URLSearchParams {
  const nuevos = new URLSearchParams(previos);
  if (!('page' in cambios)) nuevos.delete('page');
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined || valor === null || valor === '') nuevos.delete(clave);
    else nuevos.set(clave, String(valor));
  }
  return nuevos;
}

const CINCO_MIN = 5 * 60_000;

export function useBodegas() {
  return useQuery({
    queryKey: catalogosKeys.bodegas(1),
    queryFn: ({ signal }) => listarBodegas(1, signal),
    staleTime: CINCO_MIN,
  });
}

const PARAMS_PRODUCTOS = { por_pagina: 100 };

export function useProductos() {
  return useQuery({
    queryKey: catalogosKeys.productos(PARAMS_PRODUCTOS),
    queryFn: ({ signal }) => listarProductos(PARAMS_PRODUCTOS, signal),
    staleTime: CINCO_MIN,
  });
}

/** Lotes distintos (por vencimiento) de las existencias de un producto. */
function lotesDe(pagina: Paginado<Existencia>): LoteResumen[] {
  const porId = new Map<number, LoteResumen>();
  for (const e of pagina.data) porId.set(e.lote.id, e.lote);
  return [...porId.values()].toSorted((a, b) =>
    a.fecha_vencimiento.localeCompare(b.fecha_vencimiento),
  );
}

/** Lotes del producto, derivados de sus filas de inventario. */
export function useLotesDeProducto(productoId: number | undefined) {
  const filtros = { producto_id: productoId, por_pagina: 100 };
  return useQuery({
    queryKey: inventarioKeys.lista(filtros),
    queryFn: ({ signal }) => listarExistencias(filtros, signal),
    enabled: productoId !== undefined,
    select: lotesDe,
  });
}

interface PropsFiltros {
  bodegaId: number | undefined;
  productoId: number | undefined;
  loteId: number | undefined;
  onCambiar: (cambios: Cambios) => void;
}

/** Selects de bodega, producto y lote (el lote depende del producto). */
export function SelectoresCatalogo({ bodegaId, productoId, loteId, onCambiar }: PropsFiltros) {
  const bodegas = useBodegas();
  const productos = useProductos();
  const lotes = useLotesDeProducto(productoId);

  return (
    <>
      <Field label="Bodega" className="min-w-44">
        <Select
          value={bodegaId ?? ''}
          onChange={(e) => onCambiar({ bodega_id: e.target.value })}
          disabled={bodegas.isPending && !bodegas.isError}
        >
          <option value="">Todas las bodegas</option>
          {bodegas.data?.data.map((b) => (
            <option key={b.id} value={b.id}>
              {b.codigo} · {b.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Producto" className="min-w-56">
        <Select
          value={productoId ?? ''}
          // Cambiar de producto invalida el lote elegido
          onChange={(e) => onCambiar({ producto_id: e.target.value, lote_id: null })}
          disabled={productos.isPending && !productos.isError}
        >
          <option value="">Todos los productos</option>
          {productos.data?.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} · {p.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Lote"
        className="min-w-48"
        ayuda={productoId === undefined ? 'Elige primero un producto.' : undefined}
      >
        <Select
          value={loteId ?? ''}
          onChange={(e) => onCambiar({ lote_id: e.target.value })}
          disabled={productoId === undefined || lotes.isPending}
        >
          <option value="">Todos los lotes</option>
          {lotes.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.codigo} (vence {formatearFecha(l.fecha_vencimiento)})
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
