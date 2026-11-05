// Lista de traslados con filtros en la URL y alta de nuevos
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { listarTraslados, trasladosKeys } from '../../api/endpoints/traslados';
import type { FiltrosTraslados, Traslado } from '../../api/tipos';
import { puede } from '../../auth/permisos';
import { useAuth } from '../../auth/useAuth';
import { Badge, EstadoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Cargando } from '../../components/ui/Cargando';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { Field, Select } from '../../components/ui/Field';
import { Paginacion } from '../../components/ui/Paginacion';
import { Table, type Columna } from '../../components/ui/Table';
import { formatearFechaHora } from '../../lib/fechas';
import { ESTADOS_TRASLADO, esEstadoTraslado, useBodegas } from './comun';
import { NuevoTraslado } from './NuevoTraslado';

const POR_PAGINA = 20;

const COLUMNAS: Columna<Traslado>[] = [
  {
    clave: 'id',
    titulo: 'Traslado',
    celda: (t) => (
      <Link
        to={`/traslados/${t.id}`}
        className="-my-1.5 inline-block py-1.5 font-medium whitespace-nowrap text-marca-700 underline-offset-2 hover:underline"
      >
        Traslado #{t.id}
      </Link>
    ),
  },
  { clave: 'estado', titulo: 'Estado', celda: (t) => <EstadoBadge estado={t.estado} /> },
  {
    clave: 'ruta',
    titulo: 'Origen → destino',
    celda: (t) => (
      <span
        className="whitespace-nowrap"
        title={`${t.bodega_origen.nombre} → ${t.bodega_destino.nombre}`}
      >
        {t.bodega_origen.codigo} → {t.bodega_destino.codigo}
      </span>
    ),
  },
  { clave: 'items', titulo: 'Ítems', alinear: 'der', celda: (t) => t.items.length },
  { clave: 'creado', titulo: 'Creado', celda: (t) => formatearFechaHora(t.created_at) },
  {
    clave: 'discrepancias',
    titulo: 'Discrepancias',
    celda: (t) =>
      t.discrepancias.some((d) => d.estado === 'PENDIENTE') ? (
        <Badge tono="ambar">Discrepancias pendientes</Badge>
      ) : (
        <span className="text-slate-500">—</span>
      ),
  },
];

export default function PantallaTraslados() {
  const { usuario } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creando, setCreando] = useState(false);
  const bodegas = useBodegas();

  const estadoParam = params.get('estado');
  const estado = esEstadoTraslado(estadoParam) ? estadoParam : undefined;
  const bodegaId = Number(params.get('bodega_id')) || undefined;
  const pagina = Number(params.get('page')) || 1;
  const filtros: FiltrosTraslados = {
    ...(estado ? { estado } : {}),
    ...(bodegaId ? { bodega_id: bodegaId } : {}),
    por_pagina: POR_PAGINA,
    page: pagina,
  };

  const lista = useQuery({
    queryKey: trasladosKeys.lista(filtros),
    queryFn: ({ signal }) => listarTraslados(filtros, signal),
    placeholderData: keepPreviousData,
  });

  const cambiarParam = (clave: string, valor: string) => {
    setParams((prev) => {
      const sig = new URLSearchParams(prev);
      if (valor) sig.set(clave, valor);
      else sig.delete(clave);
      if (clave !== 'page') sig.delete('page');
      return sig;
    });
  };

  const puedeCrear = puede(usuario, 'traslado.operar');

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Traslados</h1>
        {puedeCrear && !creando ? (
          <Button onClick={() => setCreando(true)}>Nuevo traslado</Button>
        ) : null}
      </div>

      {creando && puedeCrear ? (
        bodegas.data ? (
          <NuevoTraslado bodegas={bodegas.data} onCancelar={() => setCreando(false)} />
        ) : bodegas.error ? (
          <ErrorBanner error={bodegas.error} onReintentar={() => void bodegas.refetch()} />
        ) : (
          <Cargando texto="Cargando bodegas…" />
        )
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Field label="Estado" className="w-48">
          <Select value={estado ?? ''} onChange={(e) => cambiarParam('estado', e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS_TRASLADO.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.texto}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bodega (origen o destino)" className="w-64">
          <Select
            value={bodegaId ? String(bodegaId) : ''}
            onChange={(e) => cambiarParam('bodega_id', e.target.value)}
          >
            <option value="">Todas</option>
            {bodegas.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} · {b.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {lista.isPending ? (
        <Cargando texto="Cargando traslados…" />
      ) : lista.error ? (
        <ErrorBanner error={lista.error} onReintentar={() => void lista.refetch()} />
      ) : lista.data.data.length === 0 ? (
        <EstadoVacio titulo="No hay traslados">
          {estado || bodegaId ? 'Prueba con otros filtros.' : 'Aún no se ha creado ninguno.'}
        </EstadoVacio>
      ) : (
        <>
          <Table
            titulo="Traslados"
            columnas={COLUMNAS}
            filas={lista.data.data}
            claveFila={(t) => t.id}
          />
          <Paginacion
            meta={lista.data.meta}
            cargando={lista.isFetching}
            onCambiar={(p) => cambiarParam('page', String(p))}
          />
        </>
      )}
    </section>
  );
}
