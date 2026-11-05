// Inventario: existencias por bodega/producto/lote, alertas y ajustes (regente)
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { inventarioKeys, listarExistencias } from '../../api/endpoints/inventario';
import type { Existencia, FiltrosInventario } from '../../api/tipos';
import { puede } from '../../auth/permisos';
import { useAuth } from '../../auth/useAuth';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Cargando } from '../../components/ui/Cargando';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { Paginacion } from '../../components/ui/Paginacion';
import { diasHastaVencer, formatearFecha } from '../../lib/fechas';
import { DialogoAjuste } from './DialogoAjuste';
import { DialogoEntrada } from './DialogoEntrada';
import { estadoExistencia, textoDias } from './estado';
import { aplicarCambios, leerId, SelectoresCatalogo, type Cambios } from './filtros';
import { PanelAlertas } from './PanelAlertas';

const POR_PAGINA = 25;

function enlaceKardex(e: Existencia): string {
  const q = new URLSearchParams({
    producto_id: String(e.producto.id),
    lote_id: String(e.lote.id),
    bodega_id: String(e.bodega.id),
  });
  return `/kardex?${q.toString()}`;
}

interface PropsTabla {
  filas: Existencia[];
  puedeRegistrar: boolean;
  onAjustar: (e: Existencia) => void;
}

function TablaExistencias({ filas, puedeRegistrar, onAjustar }: PropsTabla) {
  const hoy = new Date();
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <caption className="sr-only">Existencias de inventario</caption>
        <thead className="bg-slate-100 text-xs tracking-wide text-slate-600 uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Bodega
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Producto
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Lote
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Vencimiento
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Cantidad
            </th>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              Estado
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((e) => {
            const estado = estadoExistencia(e, hoy);
            const dias = diasHastaVencer(e.fecha_vencimiento, hoy);
            const descripcion = `${e.producto.codigo} lote ${e.lote.codigo} en ${e.bodega.codigo}`;
            return (
              <tr
                key={e.id}
                className={
                  e.vencido
                    ? 'border-l-4 border-l-red-500 bg-red-50/70 hover:bg-red-50'
                    : 'hover:bg-slate-50'
                }
              >
                <td className="px-3 py-1.5 whitespace-nowrap" title={e.bodega.nombre}>
                  {e.bodega.codigo}
                  <span className="ml-1 text-slate-500">{e.bodega.nombre}</span>
                </td>
                <td className="px-3 py-1.5">
                  <span className="font-medium">{e.producto.codigo}</span>
                  <span className="ml-1 text-slate-600">{e.producto.nombre}</span>
                </td>
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">{e.lote.codigo}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {formatearFecha(e.fecha_vencimiento)}
                  <span
                    className={`ml-1.5 text-xs ${e.vencido ? 'font-medium text-red-700' : 'text-slate-500'}`}
                  >
                    {textoDias(dias)}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">{e.cantidad}</td>
                <td className="px-3 py-1.5">
                  <Badge tono={estado.tono}>{estado.texto}</Badge>
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <Link
                      to={enlaceKardex(e)}
                      aria-label={`Ver kardex de ${descripcion}`}
                      className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-marca-700 hover:bg-slate-200/70 hover:underline"
                    >
                      Ver kardex
                    </Link>
                    {puedeRegistrar ? (
                      <Button
                        variante="secundario"
                        tamano="sm"
                        aria-label={`Ajustar ${descripcion}`}
                        onClick={() => onAjustar(e)}
                      >
                        Ajustar
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PantallaInventario() {
  const { usuario } = useAuth();
  const puedeRegistrar = puede(usuario, 'inventario.registrar');
  const [params, setParams] = useSearchParams();
  const [ajustando, setAjustando] = useState<Existencia | null>(null);
  const [registrandoEntrada, setRegistrandoEntrada] = useState(false);

  const bodegaId = leerId(params, 'bodega_id');
  const productoId = leerId(params, 'producto_id');
  const loteId = leerId(params, 'lote_id');
  const filtros: FiltrosInventario = {
    bodega_id: bodegaId,
    producto_id: productoId,
    lote_id: loteId,
    page: leerId(params, 'page') ?? 1,
    por_pagina: POR_PAGINA,
  };
  const hayFiltros = bodegaId !== undefined || productoId !== undefined || loteId !== undefined;

  const consulta = useQuery({
    queryKey: inventarioKeys.lista(filtros),
    queryFn: ({ signal }) => listarExistencias(filtros, signal),
    placeholderData: keepPreviousData,
  });

  const cambiar = (cambios: Cambios) => setParams((prev) => aplicarCambios(prev, cambios));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Inventario</h1>
        {puedeRegistrar ? (
          <Button onClick={() => setRegistrandoEntrada(true)}>Registrar entrada</Button>
        ) : null}
      </div>

      <PanelAlertas bodegaId={bodegaId} />

      <form
        role="search"
        aria-label="Filtros de inventario"
        className="flex flex-wrap items-start gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <SelectoresCatalogo
          bodegaId={bodegaId}
          productoId={productoId}
          loteId={loteId}
          onCambiar={cambiar}
        />
        <Button
          variante="secundario"
          className="mt-6"
          disabled={!hayFiltros}
          onClick={() => setParams(new URLSearchParams())}
        >
          Limpiar
        </Button>
      </form>

      {consulta.isPending ? (
        <Cargando texto="Cargando inventario…" />
      ) : consulta.isError ? (
        <ErrorBanner
          titulo="No se pudo cargar el inventario"
          error={consulta.error}
          onReintentar={() => void consulta.refetch()}
        />
      ) : consulta.data.data.length === 0 ? (
        <EstadoVacio titulo="Sin existencias">
          {hayFiltros ? 'No hay existencias con estos filtros.' : 'Aún no hay inventario.'}
        </EstadoVacio>
      ) : (
        <div className="flex flex-col gap-1" aria-busy={consulta.isFetching || undefined}>
          <TablaExistencias
            filas={consulta.data.data}
            puedeRegistrar={puedeRegistrar}
            onAjustar={setAjustando}
          />
          <Paginacion
            meta={consulta.data.meta}
            cargando={consulta.isPlaceholderData}
            onCambiar={(page) => cambiar({ page })}
          />
        </div>
      )}

      {puedeRegistrar && registrandoEntrada ? (
        <DialogoEntrada
          bodegaId={bodegaId}
          productoId={productoId}
          onCerrar={() => setRegistrandoEntrada(false)}
        />
      ) : null}

      {puedeRegistrar && ajustando ? (
        <DialogoAjuste
          key={ajustando.id}
          existencia={ajustando}
          onCerrar={() => setAjustando(null)}
        />
      ) : null}
    </section>
  );
}
