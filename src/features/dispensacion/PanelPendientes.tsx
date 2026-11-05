// Pendientes de autorización (control especial): solo regentes con dispensacion.autorizar
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  autorizarDispensacion,
  dispensacionesKeys,
  listarDispensaciones,
  rechazarDispensacion,
} from '../../api/endpoints/dispensaciones';
import { pacientesKeys } from '../../api/endpoints/pacientes';
import type { Dispensacion, FiltrosDispensaciones, Usuario } from '../../api/tipos';
import { Button } from '../../components/ui/Button';
import { Cargando } from '../../components/ui/Cargando';
import { DialogoMotivo } from '../../components/ui/DialogoMotivo';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import { formatearFechaHora } from '../../lib/fechas';
import { TablaLotes } from './TablaLotes';

export const TEXTO_SEGREGACION = 'Debe autorizarla otro regente (segregación de funciones)';

interface Props {
  usuario: Usuario;
  bodegaId: number | null;
}

export function PanelPendientes({ usuario, bodegaId }: Props) {
  const queryClient = useQueryClient();
  const filtros: FiltrosDispensaciones = {
    estado: 'PENDIENTE_AUTORIZACION',
    ...(bodegaId !== null ? { bodega_id: bodegaId } : {}),
  };
  const consulta = useQuery({
    queryKey: dispensacionesKeys.lista(filtros),
    queryFn: ({ signal }) => listarDispensaciones(filtros, signal),
  });
  const [rechazando, setRechazando] = useState<Dispensacion | null>(null);
  const [autorizada, setAutorizada] = useState<Dispensacion | null>(null);

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: dispensacionesKeys.todo });
    // Rechazar libera el pendiente de la prescripción; autorizar cambia el stock
    void queryClient.invalidateQueries({ queryKey: pacientesKeys.todo });
  };

  const filas = consulta.data?.data ?? [];

  return (
    <section
      aria-labelledby="titulo-pendientes"
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 id="titulo-pendientes" className="text-base font-semibold">
        Pendientes de autorización
        {filas.length > 0 ? (
          <span className="ml-2 text-sm font-normal text-slate-500">({filas.length})</span>
        ) : null}
      </h2>

      <div aria-live="polite">
        {autorizada ? (
          <div className="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-emerald-900">
                Dispensación #{autorizada.id} autorizada. Lotes asignados:
              </p>
              <Button variante="fantasma" tamano="sm" onClick={() => setAutorizada(null)}>
                Cerrar
              </Button>
            </div>
            <TablaLotes items={autorizada.items} detalles={autorizada.detalles} />
          </div>
        ) : null}
      </div>

      {consulta.isPending ? (
        <Cargando texto="Cargando pendientes…" />
      ) : consulta.isError ? (
        <ErrorBanner error={consulta.error} onReintentar={() => void consulta.refetch()} />
      ) : filas.length === 0 ? (
        <p className="text-sm text-slate-500">No hay dispensaciones pendientes de autorización.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {filas.map((d) => (
            <FilaPendiente
              key={d.id}
              dispensacion={d}
              usuario={usuario}
              onAutorizada={(r) => {
                setAutorizada(r);
                toast.success(`Dispensación #${r.id} autorizada`);
                refrescar();
              }}
              onRechazar={() => setRechazando(d)}
            />
          ))}
        </ul>
      )}

      <DialogoMotivo
        abierto={rechazando !== null}
        titulo={`Rechazar dispensación #${rechazando?.id ?? ''}`}
        descripcion="La dispensación quedará RECHAZADA y no se descontará stock."
        etiquetaConfirmar="Rechazar"
        onConfirmar={async (motivo) => {
          if (!rechazando) return;
          const r = await rechazarDispensacion(rechazando.id, motivo);
          toast.success(`Dispensación #${r.id} rechazada`);
          refrescar();
        }}
        onCerrar={() => setRechazando(null)}
      />
    </section>
  );
}

function FilaPendiente({
  dispensacion: d,
  usuario,
  onAutorizada,
  onRechazar,
}: {
  dispensacion: Dispensacion;
  usuario: Usuario;
  onAutorizada: (d: Dispensacion) => void;
  onRechazar: () => void;
}) {
  const [error, setError] = useState<unknown>(null);
  const propia = d.dispensado_por_id === usuario.id;
  const ayudaId = `segregacion-${d.id}`;

  const autorizar = useAccionUnica(async () => {
    setError(null);
    try {
      onAutorizada(await autorizarDispensacion(d.id));
    } catch (e) {
      setError(e);
    }
  });

  return (
    <li className="flex flex-col gap-1.5 py-2" aria-label={`Dispensación #${d.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">#{d.id}</span>{' '}
          <span className="text-slate-500">{formatearFechaHora(d.created_at)}</span>
          <span className="text-slate-500"> · Creada por </span>
          <span className="font-medium">{propia ? 'Tú' : `usuario #${d.dispensado_por_id}`}</span>
        </p>
        <div className="flex gap-2">
          <Button
            tamano="sm"
            pending={autorizar.pendiente}
            disabled={propia}
            aria-describedby={propia ? ayudaId : undefined}
            onClick={() => void autorizar.ejecutar()}
          >
            Autorizar
          </Button>
          <Button
            tamano="sm"
            variante="peligro"
            disabled={propia || autorizar.pendiente}
            aria-describedby={propia ? ayudaId : undefined}
            onClick={onRechazar}
          >
            Rechazar
          </Button>
        </div>
      </div>
      <ul className="text-sm text-slate-700">
        {d.items.map((i) => (
          <li key={i.id}>
            {i.producto.nombre} · <span className="tabular-nums">{i.cantidad}</span> und.
          </li>
        ))}
      </ul>
      {propia ? (
        <p id={ayudaId} className="text-xs font-medium text-amber-800">
          {TEXTO_SEGREGACION}
        </p>
      ) : null}
      {error ? <ErrorBanner error={error} /> : null}
    </li>
  );
}
