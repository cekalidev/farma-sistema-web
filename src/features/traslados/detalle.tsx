// Detalle de un traslado: línea de tiempo, ítems, discrepancias y acciones según estado
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { esApiError } from '../../api/client';
import {
  anularTraslado,
  aprobarTraslado,
  despacharTraslado,
  obtenerTraslado,
  recibirTraslado,
  resolverDiscrepancia,
  solicitarTraslado,
  trasladosKeys,
} from '../../api/endpoints/traslados';
import { invalidarStock } from '../../api/invalidaciones';
import type { RecepcionTraslado, TipoResolucion, Traslado, Usuario } from '../../api/tipos';
import { useAuth } from '../../auth/useAuth';
import { EstadoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Cargando } from '../../components/ui/Cargando';
import { DialogoConfirmar } from '../../components/ui/DialogoConfirmar';
import { DialogoMotivo } from '../../components/ui/DialogoMotivo';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { CLASE_CONTENEDOR_TABLA, CLASE_TD, CLASE_TH, CLASE_THEAD } from '../../components/ui/Table';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import { formatearFecha, formatearFechaHora } from '../../lib/fechas';
import { accionesDisponibles, type AccionTraslado } from './acciones';
import { quien } from './comun';
import { Discrepancias } from './Discrepancias';
import { Recepcion } from './Recepcion';

type AccionSinCuerpo = 'solicitar' | 'aprobar' | 'despachar';

const LLAMADAS: Record<AccionSinCuerpo, (id: number) => Promise<Traslado>> = {
  solicitar: solicitarTraslado,
  aprobar: aprobarTraslado,
  despachar: despacharTraslado,
};

const EXITO: Record<AccionTraslado, string> = {
  solicitar: 'Traslado solicitado. Queda pendiente de aprobación.',
  aprobar: 'Traslado aprobado.',
  despachar: 'Traslado despachado: el stock salió del origen.',
  recibir: 'Recepción registrada.',
  anular: 'Traslado anulado.',
};

const esTransicionInvalida = (e: unknown) => esApiError(e) && e.codigo === 'TRANSICION_INVALIDA';

/** Ítems del traslado. En móvil el lote pasa bajo el producto para no forzar scroll. */
function TablaItems({ items }: { items: Traslado['items'] }) {
  return (
    <div className={CLASE_CONTENEDOR_TABLA}>
      <table className="min-w-full text-sm">
        <caption className="sr-only">Ítems del traslado</caption>
        <thead className={CLASE_THEAD}>
          <tr>
            <th scope="col" className={`${CLASE_TH} text-left`}>
              Producto
            </th>
            <th scope="col" className={`${CLASE_TH} hidden text-left sm:table-cell`}>
              Lote
            </th>
            <th scope="col" className={`${CLASE_TH} hidden text-left sm:table-cell`}>
              Vencimiento
            </th>
            <th scope="col" className={`${CLASE_TH} text-right`}>
              Enviada
            </th>
            <th scope="col" className={`${CLASE_TH} text-right`}>
              Recibida
            </th>
            <th scope="col" className={`${CLASE_TH} text-right`}>
              Diferencia
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((it) => {
            const dif = it.cantidad_recibida === null ? null : it.cantidad_recibida - it.cantidad;
            return (
              <tr key={it.id} className="hover:bg-slate-50">
                <td className={CLASE_TD}>
                  {it.producto.nombre}
                  <span className="block font-mono text-xs whitespace-nowrap text-slate-600 sm:hidden">
                    {it.lote.codigo} · vence {formatearFecha(it.lote.fecha_vencimiento)}
                  </span>
                </td>
                <td
                  className={`${CLASE_TD} hidden font-mono text-xs whitespace-nowrap sm:table-cell`}
                >
                  {it.lote.codigo}
                </td>
                <td className={`${CLASE_TD} hidden whitespace-nowrap sm:table-cell`}>
                  {formatearFecha(it.lote.fecha_vencimiento)}
                </td>
                <td className={`${CLASE_TD} text-right tabular-nums`}>{it.cantidad}</td>
                <td className={`${CLASE_TD} text-right tabular-nums`}>
                  {it.cantidad_recibida ?? '—'}
                </td>
                <td className={`${CLASE_TD} text-right tabular-nums`}>
                  {dif === null ? (
                    '—'
                  ) : dif === 0 ? (
                    '0'
                  ) : (
                    <span className="font-medium text-aviso-800">{dif}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LineaTiempo({ t, usuario }: { t: Traslado; usuario: Usuario | null }) {
  const pasos: { nombre: string; en: string | null; por: number | null }[] = [
    { nombre: 'Creado', en: t.created_at, por: t.creado_por_id },
    { nombre: 'Solicitado', en: t.solicitado_en, por: t.solicitado_por_id },
    { nombre: 'Aprobado', en: t.aprobado_en, por: t.aprobado_por_id },
    { nombre: 'Despachado', en: t.despachado_en, por: t.despachado_por_id },
    { nombre: 'Recibido', en: t.recibido_en, por: t.recibido_por_id },
  ];
  // Si se anuló, los pasos no alcanzados ya no ocurrirán
  const visibles = t.anulado_en
    ? [...pasos.filter((p) => p.en), { nombre: 'Anulado', en: t.anulado_en, por: t.anulado_por_id }]
    : pasos;
  return (
    <ol aria-label="Línea de tiempo" className="flex flex-col gap-1.5 text-sm">
      {visibles.map((p) => (
        <li key={p.nombre} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-full ${p.en ? (p.nombre === 'Anulado' ? 'bg-peligro-600' : 'bg-marca-700') : 'border border-slate-400'}`}
          />
          <span className={`w-24 shrink-0 font-medium ${p.en ? '' : 'text-slate-500'}`}>
            {p.nombre}
          </span>
          {p.en ? (
            <span className="text-slate-700">
              {formatearFechaHora(p.en)} · {quien(p.por, usuario)}
            </span>
          ) : (
            <span className="text-slate-500">Pendiente</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function DetalleTraslado() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const valido = Number.isInteger(id) && id > 0;
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const idBase = useId();

  const [errorAccion, setErrorAccion] = useState<unknown>(null);
  const [dialogo, setDialogo] = useState<'anular' | 'despachar' | 'recibir' | null>(null);

  const detalle = useQuery({
    queryKey: trasladosKeys.detalle(id),
    queryFn: ({ signal }) => obtenerTraslado(id, signal),
    enabled: valido,
  });

  const invalidarRelacionados = (mueveStock: boolean) => {
    void queryClient.invalidateQueries({ queryKey: [...trasladosKeys.todo, 'lista'] });
    // Despachar, recibir y resolver mueven stock: inventario, kardex y alertas
    if (mueveStock) void invalidarStock(queryClient);
  };

  const aplicarExito = (t: Traslado, accion: AccionTraslado) => {
    queryClient.setQueryData(trasladosKeys.detalle(t.id), t);
    invalidarRelacionados(accion === 'despachar' || accion === 'recibir');
    setErrorAccion(null);
    setDialogo(null);
    toast.success(EXITO[accion]);
  };

  /** 409: otra persona cambió el estado → se informa y se recarga. Devuelve true si lo manejó. */
  const manejarConflicto = (e: unknown): boolean => {
    if (!esTransicionInvalida(e)) return false;
    setErrorAccion(e);
    setDialogo(null);
    void queryClient.invalidateQueries({ queryKey: trasladosKeys.detalle(id) });
    invalidarRelacionados(false);
    return true;
  };

  const sinCuerpo = useAccionUnica(async (accion: AccionSinCuerpo) => {
    setErrorAccion(null);
    try {
      aplicarExito(await LLAMADAS[accion](id), accion);
    } catch (e) {
      if (!manejarConflicto(e)) {
        setErrorAccion(e);
        setDialogo(null);
      }
    }
  });
  const [enCurso, setEnCurso] = useState<AccionSinCuerpo | null>(null);
  const ejecutarSinCuerpo = (accion: AccionSinCuerpo) => {
    setEnCurso(accion);
    void sinCuerpo.ejecutar(accion);
  };

  // Para diálogos: si lanza, el error se ve dentro; el 409 cierra y recarga
  const conDialogo = async (accion: 'anular' | 'recibir', llamada: () => Promise<Traslado>) => {
    try {
      aplicarExito(await llamada(), accion);
    } catch (e) {
      if (!manejarConflicto(e)) throw e;
    }
  };

  const resolver = async (discrepanciaId: number, tipo: TipoResolucion, motivo: string) => {
    try {
      await resolverDiscrepancia(discrepanciaId, { tipo, motivo });
      toast.success('Discrepancia resuelta.');
      setErrorAccion(null);
      await queryClient.invalidateQueries({ queryKey: trasladosKeys.detalle(id) });
      invalidarRelacionados(true);
    } catch (e) {
      if (!esTransicionInvalida(e)) throw e;
      setErrorAccion(e);
      void queryClient.invalidateQueries({ queryKey: trasladosKeys.detalle(id) });
    }
  };

  if (!valido) return <EstadoVacio titulo="Traslado no encontrado" />;

  const volver = (
    <Link to="/traslados" className="text-sm text-marca-700 hover:underline">
      ← Traslados
    </Link>
  );

  if (detalle.isPending) return <Cargando texto="Cargando traslado…" />;
  if (detalle.error) {
    return (
      <section className="flex flex-col gap-3">
        {volver}
        <ErrorBanner error={detalle.error} onReintentar={() => void detalle.refetch()} />
      </section>
    );
  }

  const t = detalle.data;
  const { acciones, resolverDiscrepancias } = accionesDisponibles(t, usuario);
  // Una acción en curso o un diálogo/formulario abierto bloquea las demás acciones
  const ocupado = sinCuerpo.pendiente || dialogo !== null;
  const enviandoSinCuerpo = (accion: AccionTraslado) =>
    sinCuerpo.pendiente && enCurso === accion && dialogo === null;
  const idMotivo = (accion: AccionTraslado) => `${idBase}-motivo-${accion}`;

  const alPulsar = (accion: AccionTraslado, confirmar?: boolean) => {
    setErrorAccion(null);
    if (accion === 'anular' || accion === 'recibir') setDialogo(accion);
    else if (accion === 'despachar' && confirmar) setDialogo('despachar');
    else ejecutarSinCuerpo(accion);
  };

  return (
    <section className="flex flex-col gap-4">
      {volver}
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Traslado #{t.id}</h1>
          <EstadoBadge estado={t.estado} tamano="lg" />
        </div>
        <p className="text-sm text-pretty text-slate-700">
          <span className="font-medium">{t.bodega_origen.nombre}</span> ({t.bodega_origen.codigo}) →{' '}
          <span className="font-medium">{t.bodega_destino.nombre}</span> ({t.bodega_destino.codigo})
        </p>
      </header>

      {errorAccion ? (
        <ErrorBanner
          error={errorAccion}
          {...(esTransicionInvalida(errorAccion)
            ? { titulo: 'Otra persona cambió el estado del traslado. Se recargó su estado actual.' }
            : {})}
        />
      ) : null}

      {acciones.length > 0 ? (
        <div role="group" aria-label="Acciones del traslado" className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            {acciones.map((a) => {
              const conMotivo = !a.habilitada && a.motivo;
              return (
                <Button
                  key={a.accion}
                  variante={a.accion === 'anular' ? 'peligroSecundario' : 'primario'}
                  className={a.accion === 'anular' ? 'sm:ml-auto' : ''}
                  disabled={!a.habilitada || (ocupado && !enviandoSinCuerpo(a.accion))}
                  pending={enviandoSinCuerpo(a.accion)}
                  aria-describedby={conMotivo ? idMotivo(a.accion) : undefined}
                  onClick={() => alPulsar(a.accion, a.confirmar)}
                >
                  {a.etiqueta}
                </Button>
              );
            })}
          </div>
          {acciones
            .filter((a) => !a.habilitada && a.motivo)
            .map((a) => (
              <p key={a.accion} id={idMotivo(a.accion)} className="text-xs text-slate-600">
                {a.etiqueta}: {a.motivo}
              </p>
            ))}
        </div>
      ) : null}

      {dialogo === 'recibir' ? (
        <Recepcion
          traslado={t}
          onConfirmar={(datos: RecepcionTraslado) =>
            conDialogo('recibir', () => recibirTraslado(t.id, datos))
          }
          onCancelar={() => setDialogo(null)}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="titulo-seguimiento" className="flex flex-col gap-2">
          <h2 id="titulo-seguimiento" className="text-base font-semibold">
            Seguimiento
          </h2>
          <LineaTiempo t={t} usuario={usuario} />
        </section>
        <section aria-labelledby="titulo-observaciones" className="flex flex-col gap-2">
          <h2 id="titulo-observaciones" className="text-base font-semibold">
            Observaciones
          </h2>
          {/* Texto de usuario: siempre como texto plano */}
          <p className="text-sm whitespace-pre-wrap text-slate-700">
            {t.observaciones ?? 'Sin observaciones.'}
          </p>
          {t.motivo_anulacion ? (
            <p className="text-sm text-peligro-800">
              <span className="font-medium">Motivo de anulación:</span> {t.motivo_anulacion}
            </p>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="titulo-items" className="flex flex-col gap-2">
        <h2 id="titulo-items" className="text-base font-semibold">
          Ítems
        </h2>
        <TablaItems items={t.items} />
      </section>

      <Discrepancias
        traslado={t}
        usuario={usuario}
        permiso={resolverDiscrepancias}
        onResolver={(d, tipo, motivo) => resolver(d.id, tipo, motivo)}
      />

      <DialogoMotivo
        abierto={dialogo === 'anular'}
        titulo={`Anular traslado #${t.id}`}
        descripcion="El traslado quedará anulado y no podrá continuar."
        etiquetaConfirmar="Anular traslado"
        onConfirmar={(motivo) => conDialogo('anular', () => anularTraslado(t.id, motivo))}
        onCerrar={() => setDialogo(null)}
      />

      <DialogoConfirmar
        abierto={dialogo === 'despachar'}
        titulo={`Despachar traslado #${t.id}`}
        texto={`Se descontará el stock de ${t.bodega_origen.nombre} y el traslado quedará en tránsito.`}
        etiquetaConfirmar="Sí, despachar"
        pending={sinCuerpo.pendiente}
        onConfirmar={() => ejecutarSinCuerpo('despachar')}
        onCerrar={() => setDialogo(null)}
      />
    </section>
  );
}
