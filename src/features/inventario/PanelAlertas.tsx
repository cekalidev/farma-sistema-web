// Alertas de vencimiento y stock mínimo (RN-11); cada consulta falla por separado
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { alertasKeys, alertasStockMinimo, alertasVencimiento } from '../../api/endpoints/alertas';
import type { AlertaVencimiento } from '../../api/tipos';
import { Cargando } from '../../components/ui/Cargando';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { textoDias } from './estado';

const MAX_VISIBLES = 5;

interface PropsTarjeta {
  titulo: string;
  total: number;
  tono: 'rojo' | 'ambar' | 'violeta';
  children: ReactNode;
}

const TONO_TARJETA = {
  rojo: { borde: 'border-red-200', contador: 'text-red-700' },
  ambar: { borde: 'border-amber-200', contador: 'text-amber-700' },
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
        <span className="font-medium">{a.producto.codigo}</span> · {a.lote.codigo} ·{' '}
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
    queryFn: ({ signal }) => alertasVencimiento(bodegaId, signal),
  });
  const minimos = useQuery({
    queryKey: alertasKeys.stockMinimo(bodegaId),
    queryFn: ({ signal }) => alertasStockMinimo(bodegaId, signal),
  });

  const vencidos = vencimientos.data?.filter((a) => a.tipo === 'VENCIDO') ?? [];
  const porVencer = vencimientos.data?.filter((a) => a.tipo === 'POR_VENCER') ?? [];

  return (
    <section aria-labelledby="titulo-alertas" className="flex flex-col gap-2">
      <h2 id="titulo-alertas" className="text-sm font-semibold text-slate-700">
        Alertas
      </h2>
      <div className="grid gap-2 md:grid-cols-3">
        {vencimientos.isError ? (
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
            <Tarjeta titulo="Por vencer (≤90 días)" total={porVencer.length} tono="ambar">
              <ListaCompacta filas={porVencer.map(filaVencimiento)} vacio="Sin lotes por vencer." />
            </Tarjeta>
          </>
        )}
        {minimos.isError ? (
          <ErrorBanner
            titulo="No se pudo cargar el stock mínimo"
            error={minimos.error}
            onReintentar={() => void minimos.refetch()}
          />
        ) : minimos.isPending ? (
          <Cargando texto="Cargando stock mínimo…" />
        ) : (
          <Tarjeta titulo="Bajo stock mínimo" total={minimos.data.length} tono="violeta">
            <ListaCompacta
              vacio="Todo por encima del mínimo."
              filas={minimos.data.map((a) => (
                <li
                  key={`${a.bodega.id}-${a.producto.id}`}
                  className="flex justify-between gap-2 py-1"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{a.producto.codigo}</span> ·{' '}
                    <span className="text-slate-500">{a.bodega.codigo}</span>
                  </span>
                  <span className="shrink-0 text-slate-600 tabular-nums">
                    {a.actual}/{a.minimo}
                  </span>
                </li>
              ))}
            />
          </Tarjeta>
        )}
      </div>
    </section>
  );
}
