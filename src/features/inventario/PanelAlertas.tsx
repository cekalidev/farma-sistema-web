// Alertas de vencimiento y stock mínimo (RN-11); cada consulta falla por separado
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { esApiError } from '../../api/client';
import {
  alertasKeys,
  listarAlertasStockMinimo,
  listarAlertasVencimiento,
} from '../../api/endpoints/alertas';
import type { AlertaVencimiento } from '../../api/tipos';
import { Cargando } from '../../components/ui/Cargando';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { DIAS_POR_VENCER, formatearFecha } from '../../lib/fechas';
import { textoDias } from './estado';

/** 404/405: backend anterior a v0.12.0, sin alertas: aviso discreto, no error. */
const noDisponible = (e: unknown) => esApiError(e) && (e.status === 404 || e.status === 405);

const MAX_VISIBLES = 5;

interface PropsTarjeta {
  titulo: string;
  total: number;
  tono: 'rojo' | 'ambar' | 'violeta';
  children: ReactNode;
}

const TONO_TARJETA = {
  rojo: { borde: 'border-peligro-300', contador: 'text-peligro-700' },
  ambar: { borde: 'border-aviso-300', contador: 'text-aviso-800' },
  violeta: { borde: 'border-violet-200', contador: 'text-violet-700' },
} as const;

function Tarjeta({ titulo, total, tono, children }: PropsTarjeta) {
  return (
    <section
      aria-label={titulo}
      className={`flex min-w-0 flex-col gap-1 rounded-md border bg-white px-3 py-2 ${TONO_TARJETA[tono].borde}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-700">{titulo}</h3>
        <span className={`text-xl font-semibold tabular-nums ${TONO_TARJETA[tono].contador}`}>
          {total}
        </span>
      </div>
      {children}
    </section>
  );
}

function ListaCompacta({ filas, vacio }: { filas: ReactNode[]; vacio: string }) {
  if (filas.length === 0) return <p className="text-xs text-slate-500">{vacio}</p>;
  const resto = filas.length - MAX_VISIBLES;
  return (
    <ul className="flex flex-col divide-y divide-slate-100 text-xs">
      {filas.slice(0, MAX_VISIBLES)}
      {resto > 0 ? <li className="pt-1 text-slate-500">y {resto} más…</li> : null}
    </ul>
  );
}

function filaVencimiento(a: AlertaVencimiento) {
  return (
    <li key={a.existencia_id} className="flex justify-between gap-2 py-1">
      <span className="min-w-0 truncate">
        <span className="font-medium">{a.producto.codigo}</span> ·{' '}
        <span className="font-mono whitespace-nowrap">{a.lote.codigo}</span> ·{' '}
        <span className="text-slate-500">{a.bodega.codigo}</span>
      </span>
      <span className="shrink-0 text-slate-600 tabular-nums">
        {textoDias(a.dias_restantes)} · {a.cantidad} u.
      </span>
    </li>
  );
}

export function PanelAlertas({ bodegaId }: { bodegaId: number | undefined }) {
  const vencimientos = useQuery({
    queryKey: alertasKeys.vencimientos(bodegaId),
    queryFn: ({ signal }) => listarAlertasVencimiento(bodegaId, signal),
  });
  const minimos = useQuery({
    queryKey: alertasKeys.stockMinimo(bodegaId),
    queryFn: ({ signal }) => listarAlertasStockMinimo(bodegaId, signal),
  });

  const filasVenc = vencimientos.data?.data ?? [];
  const vencidos = filasVenc.filter((a) => a.tipo === 'VENCIDO');
  const porVencer = filasVenc.filter((a) => a.tipo === 'POR_VENCER');
  const hoy = vencimientos.data?.meta.hoy ?? minimos.data?.meta.hoy;
  const dias = vencimientos.data?.meta.dias_alerta_vencimiento ?? DIAS_POR_VENCER;
  const sinVenc = noDisponible(vencimientos.error);
  const sinMinimos = noDisponible(minimos.error);

  return (
    <section aria-labelledby="titulo-alertas" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="titulo-alertas" className="text-sm font-semibold text-slate-700">
          Alertas
        </h2>
        {hoy ? (
          <p className="text-xs text-slate-500">
            al {formatearFecha(hoy)} · próximos {dias} días
          </p>
        ) : null}
      </div>
      {sinVenc && sinMinimos ? (
        <p role="status" className="text-xs text-slate-500">
          Alertas no disponibles en este servidor.
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-3">
          {sinVenc ? (
            <p role="status" className="text-xs text-slate-500 md:col-span-2">
              Alertas de vencimiento no disponibles en este servidor.
            </p>
          ) : vencimientos.isError ? (
            <div className="md:col-span-2">
              <ErrorBanner
                titulo="No se pudieron cargar las alertas de vencimiento"
                error={vencimientos.error}
                onReintentar={() => void vencimientos.refetch()}
              />
            </div>
          ) : vencimientos.isPending ? (
            <div className="md:col-span-2">
              <Cargando texto="Cargando alertas de vencimiento…" />
            </div>
          ) : (
            <>
              <Tarjeta titulo="Lotes vencidos con stock" total={vencidos.length} tono="rojo">
                <ListaCompacta filas={vencidos.map(filaVencimiento)} vacio="Sin lotes vencidos." />
              </Tarjeta>
              <Tarjeta titulo={`Por vencer (≤${dias} días)`} total={porVencer.length} tono="ambar">
                <ListaCompacta
                  filas={porVencer.map(filaVencimiento)}
                  vacio="Sin lotes por vencer."
                />
              </Tarjeta>
            </>
          )}
          {sinMinimos ? (
            <p role="status" className="text-xs text-slate-500">
              Stock mínimo no disponible en este servidor.
            </p>
          ) : minimos.isError ? (
            <ErrorBanner
              titulo="No se pudo cargar el stock mínimo"
              error={minimos.error}
              onReintentar={() => void minimos.refetch()}
            />
          ) : minimos.isPending ? (
            <Cargando texto="Cargando stock mínimo…" />
          ) : (
            <Tarjeta titulo="Bajo stock mínimo" total={minimos.data.data.length} tono="violeta">
              <ListaCompacta
                vacio="Todo por encima del mínimo."
                filas={minimos.data.data.map((a) => (
                  <li key={a.stock_minimo_id} className="flex justify-between gap-2 py-1">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{a.producto.codigo}</span> ·{' '}
                      <span className="text-slate-500">{a.bodega.codigo}</span>
                    </span>
                    <span
                      className="shrink-0 text-slate-600 tabular-nums"
                      title={`Faltan ${a.faltante}`}
                    >
                      {a.actual}/{a.minimo}
                    </span>
                  </li>
                ))}
              />
            </Tarjeta>
          )}
        </div>
      )}
    </section>
  );
}
