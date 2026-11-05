// Kardex: movimientos de inventario, solo lectura (RN-06: inmutable)
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { kardexKeys, listarMovimientos } from '../../api/endpoints/kardex';
import type { FiltrosKardex, MovimientoKardex, TipoMovimiento } from '../../api/tipos';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Cargando } from '../../components/ui/Cargando';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { Field, Input } from '../../components/ui/Field';
import { Paginacion } from '../../components/ui/Paginacion';
import { CLASE_CONTENEDOR_TABLA, CLASE_TD, CLASE_TH, CLASE_THEAD } from '../../components/ui/Table';
import { formatearFechaHora } from '../../lib/fechas';
import {
  aplicarCambios,
  leerFecha,
  leerId,
  SelectoresCatalogo,
  type Cambios,
} from '../inventario/filtros';

const POR_PAGINA = 25;

type Tono = 'verde' | 'azul' | 'rojo' | 'ambar' | 'gris';

const TIPOS: Record<TipoMovimiento, { texto: string; tono: Tono }> = {
  ENTRADA: { texto: 'Entrada', tono: 'verde' },
  SALIDA_DISPENSACION: { texto: 'Salida por dispensación', tono: 'rojo' },
  SALIDA_TRASLADO: { texto: 'Salida por traslado', tono: 'ambar' },
  ENTRADA_TRASLADO: { texto: 'Entrada por traslado', tono: 'azul' },
  AJUSTE: { texto: 'Ajuste', tono: 'gris' },
};

/** Cantidad con signo explícito (+ / −). */
function conSigno(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

function Documento({ doc }: { doc: MovimientoKardex['documento'] }) {
  if (!doc) return <span className="text-slate-500">—</span>;
  if (doc.tipo === 'traslado') {
    return (
      <Link to={`/traslados/${doc.id}`} className="text-marca-700 hover:underline">
        Traslado #{doc.id}
      </Link>
    );
  }
  return <span>Dispensación #{doc.id}</span>;
}

function TablaKardex({ filas }: { filas: MovimientoKardex[] }) {
  return (
    <div className={CLASE_CONTENEDOR_TABLA}>
      <table className="min-w-full text-sm">
        <caption className="sr-only">Movimientos del kardex</caption>
        <thead className={CLASE_THEAD}>
          <tr>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Fecha y hora
            </th>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Tipo
            </th>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Bodega
            </th>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Producto
            </th>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Lote
            </th>
            <th scope="col" className={`${CLASE_TH} text-right`}>
              Cantidad
            </th>
            <th scope="col" className={`${CLASE_TH} text-right`}>
              Saldo
            </th>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Usuario
            </th>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Documento
            </th>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Motivo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((m) => {
            const tipo = TIPOS[m.tipo];
            return (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className={`${CLASE_TD} whitespace-nowrap tabular-nums`}>
                  {formatearFechaHora(m.created_at)}
                </td>
                <td className={CLASE_TD}>
                  <Badge tono={tipo.tono}>{tipo.texto}</Badge>
                </td>
                <td className={`${CLASE_TD} whitespace-nowrap`} title={m.bodega.nombre}>
                  {m.bodega.codigo}
                </td>
                <td className={CLASE_TD}>
                  <span className="font-medium">{m.producto.codigo}</span>
                  <span className="ml-1 text-slate-600">{m.producto.nombre}</span>
                </td>
                <td className={`${CLASE_TD} font-mono text-xs whitespace-nowrap`}>
                  {m.lote.codigo}
                </td>
                <td
                  className={`${CLASE_TD} text-right font-semibold tabular-nums ${
                    m.cantidad > 0 ? 'text-ok-700' : m.cantidad < 0 ? 'text-peligro-700' : ''
                  }`}
                >
                  {conSigno(m.cantidad)}
                </td>
                <td className={`${CLASE_TD} text-right whitespace-nowrap tabular-nums`}>
                  <span className="text-slate-500">{m.saldo_anterior}</span>
                  <span aria-hidden="true" className="px-1 text-slate-400">
                    →
                  </span>
                  <span className="sr-only"> a </span>
                  <span className="font-medium">{m.saldo_posterior}</span>
                </td>
                <td className={`${CLASE_TD} whitespace-nowrap`}>{m.usuario.nombre}</td>
                <td className={`${CLASE_TD} whitespace-nowrap`}>
                  <Documento doc={m.documento} />
                </td>
                <td className={`${CLASE_TD} max-w-72 text-slate-600`} title={m.motivo ?? undefined}>
                  <span className="line-clamp-2">{m.motivo ?? '—'}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PantallaKardex() {
  const [params, setParams] = useSearchParams();

  const productoId = leerId(params, 'producto_id');
  const loteId = leerId(params, 'lote_id');
  const bodegaId = leerId(params, 'bodega_id');
  const existenciaId = leerId(params, 'existencia_id');
  const desde = leerFecha(params, 'desde');
  const hasta = leerFecha(params, 'hasta');
  // Fechas Y-m-d: la comparación de texto respeta el orden cronológico
  const rangoInvalido = desde !== undefined && hasta !== undefined && hasta < desde;

  const filtros: FiltrosKardex = {
    producto_id: productoId,
    lote_id: loteId,
    bodega_id: bodegaId,
    existencia_id: existenciaId,
    desde,
    hasta,
    page: leerId(params, 'page') ?? 1,
    por_pagina: POR_PAGINA,
  };
  const hayFiltros = [...params.keys()].some((k) => k !== 'page');

  const consulta = useQuery({
    queryKey: kardexKeys.lista(filtros),
    queryFn: ({ signal }) => listarMovimientos(filtros, signal),
    enabled: !rangoInvalido,
    placeholderData: keepPreviousData,
  });

  const cambiar = (cambios: Cambios) => setParams((prev) => aplicarCambios(prev, cambios));

  let contenido;
  if (rangoInvalido) {
    contenido = (
      <EstadoVacio titulo="Rango de fechas inválido">
        Corrige las fechas para consultar los movimientos.
      </EstadoVacio>
    );
  } else if (consulta.isPending) {
    contenido = <Cargando texto="Cargando movimientos…" />;
  } else if (consulta.isError) {
    contenido = (
      <ErrorBanner
        titulo="No se pudo cargar el kardex"
        error={consulta.error}
        onReintentar={() => void consulta.refetch()}
      />
    );
  } else if (consulta.data.data.length === 0) {
    contenido = (
      <EstadoVacio titulo="Sin movimientos">
        {hayFiltros ? 'No hay movimientos con estos filtros.' : 'Aún no hay movimientos.'}
      </EstadoVacio>
    );
  } else {
    contenido = (
      <div className="flex flex-col gap-1" aria-busy={consulta.isFetching || undefined}>
        <TablaKardex filas={consulta.data.data} />
        <Paginacion
          meta={consulta.data.meta}
          cargando={consulta.isPlaceholderData}
          onCambiar={(page) => cambiar({ page })}
        />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Kardex</h1>
        <p className="text-sm text-slate-600">
          Registro inmutable de movimientos. Las correcciones se hacen con ajustes desde Inventario.
        </p>
      </div>

      <form
        role="search"
        aria-label="Filtros del kardex"
        className="flex flex-wrap items-start gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <SelectoresCatalogo
          bodegaId={bodegaId}
          productoId={productoId}
          loteId={loteId}
          onCambiar={cambiar}
        />
        <Field label="Desde">
          <Input
            type="date"
            value={desde ?? ''}
            max={hasta}
            onChange={(e) => cambiar({ desde: e.target.value })}
          />
        </Field>
        <Field
          label="Hasta"
          error={rangoInvalido ? 'La fecha final no puede ser anterior a la inicial.' : undefined}
        >
          <Input
            type="date"
            value={hasta ?? ''}
            min={desde}
            onChange={(e) => cambiar({ hasta: e.target.value })}
          />
        </Field>
        <Button
          variante="secundario"
          className="mt-6"
          disabled={!hayFiltros}
          onClick={() => setParams(new URLSearchParams())}
        >
          Limpiar
        </Button>
      </form>

      {existenciaId !== undefined ? (
        <p className="text-sm text-slate-600">Filtrado por la existencia #{existenciaId}.</p>
      ) : null}

      {contenido}
    </section>
  );
}
