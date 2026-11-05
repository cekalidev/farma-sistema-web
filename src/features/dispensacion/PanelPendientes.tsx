// Pendientes de autorización (control especial): solo regentes con dispensacion.autorizar.
// Listado del contrato v0.13.0 (sin paciente ni detalles); ante 404/405 se abre una por su número.
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  autorizarDispensacion,
  dispensacionesKeys,
  listarDispensaciones,
  obtenerDispensacion,
  rechazarDispensacion,
  type DispensacionListado,
} from '../../api/endpoints/dispensaciones';
import { invalidarStock } from '../../api/invalidaciones';
import type { Dispensacion, FiltrosDispensaciones, Paciente, Usuario } from '../../api/tipos';
import { Badge, EstadoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Cargando } from '../../components/ui/Cargando';
import { DialogoMotivo } from '../../components/ui/DialogoMotivo';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Field, Input } from '../../components/ui/Field';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import { formatearFechaHora } from '../../lib/fechas';
import { listadoNoDisponible, nombreCompleto, nombreUsuario, productoDelError } from './logica';
import { TablaLotes } from './TablaLotes';

export const TEXTO_SEGREGACION = 'Debe autorizarla otro regente (segregación de funciones)';

interface Props {
  usuario: Usuario;
  bodegaId: number | null;
  /** Ids de pendientes creadas en esta sesión (accesos rápidos si no hay listado). */
  recientes: number[];
  onOlvidar: (id: number) => void;
}

/** Tras autorizar o rechazar: dispensaciones, pendientes de las prescripciones y stock. */
function refrescarTras(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: dispensacionesKeys.todo });
  // Solo prescripciones: invalidar la búsqueda repetiría consultas de pacientes (RN-10)
  void queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'pacientes' && q.queryKey[2] === 'prescripciones',
  });
}

export function PanelPendientes({ usuario, bodegaId, recientes, onOlvidar }: Props) {
  const queryClient = useQueryClient();
  const filtros: FiltrosDispensaciones = {
    estado: 'PENDIENTE_AUTORIZACION',
    ...(bodegaId !== null ? { bodega_id: bodegaId } : {}),
  };
  const consulta = useQuery({
    queryKey: dispensacionesKeys.lista(filtros),
    queryFn: ({ signal }) => listarDispensaciones(filtros, signal),
  });
  const degradado = consulta.isError && listadoNoDisponible(consulta.error);

  const [abiertaId, setAbiertaId] = useState<number | null>(null);
  const detalle = useQuery({
    queryKey: dispensacionesKeys.detalle(abiertaId ?? 0),
    queryFn: ({ signal }) => obtenerDispensacion(abiertaId ?? 0, signal),
    enabled: degradado && abiertaId !== null,
  });

  const [rechazando, setRechazando] = useState<DispensacionListado | null>(null);
  const [autorizada, setAutorizada] = useState<Dispensacion | null>(null);

  const resuelta = (id: number) => {
    refrescarTras(queryClient);
    onOlvidar(id);
  };

  const actualizar = () => {
    void consulta.refetch();
    if (degradado && abiertaId !== null) void detalle.refetch();
  };

  const filas = consulta.data?.data ?? [];
  const total = consulta.data?.meta.total;

  // El paciente solo llega en el detalle (modo degradado), nunca en las filas del listado
  const tarjeta = (d: DispensacionListado, paciente?: Paciente) => (
    <TarjetaPendiente
      key={d.id}
      dispensacion={d}
      paciente={paciente}
      usuario={usuario}
      onAutorizada={(r) => {
        setAutorizada(r);
        toast.success(`Dispensación #${r.id} autorizada`);
        void invalidarStock(queryClient);
        resuelta(r.id);
      }}
      onRechazar={() => setRechazando(d)}
    />
  );

  return (
    <section
      aria-labelledby="titulo-pendientes"
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-pendientes" className="text-base font-semibold">
          Pendientes de autorización
          {total !== undefined && total > 0 ? (
            <span className="ml-2 text-sm font-normal text-slate-500">({total})</span>
          ) : null}
        </h2>
        <Button
          variante="fantasma"
          tamano="sm"
          pending={consulta.isFetching || detalle.isFetching}
          onClick={actualizar}
        >
          Actualizar
        </Button>
      </div>

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
      ) : degradado ? (
        <>
          <AbrirDispensacion recientes={recientes} onAbrir={setAbiertaId} />
          {abiertaId === null ? null : detalle.isPending ? (
            <Cargando texto={`Abriendo dispensación #${abiertaId}…`} />
          ) : detalle.isError ? (
            <ErrorBanner error={detalle.error} onReintentar={() => void detalle.refetch()} />
          ) : (
            <ul>{tarjeta(detalle.data, detalle.data.paciente)}</ul>
          )}
        </>
      ) : consulta.isError ? (
        <ErrorBanner error={consulta.error} onReintentar={() => void consulta.refetch()} />
      ) : filas.length === 0 ? (
        <p className="text-sm text-slate-500">No hay dispensaciones pendientes de autorización.</p>
      ) : (
        <ul className="divide-y divide-slate-100">{filas.map((d) => tarjeta(d))}</ul>
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
          resuelta(r.id);
        }}
        onCerrar={() => setRechazando(null)}
      />
    </section>
  );
}

const ID_VALIDO = /^[1-9]\d{0,17}$/;

function AbrirDispensacion({
  recientes,
  onAbrir,
}: {
  recientes: number[];
  onAbrir: (id: number) => void;
}) {
  const [valor, setValor] = useState('');
  const [error, setError] = useState<string | undefined>();
  const abrir = (e: FormEvent) => {
    e.preventDefault();
    const v = valor.trim();
    if (!ID_VALIDO.test(v)) {
      setError('Escribe el número de la dispensación.');
      return;
    }
    setError(undefined);
    onAbrir(Number(v));
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        El servidor aún no publica el listado: abre la dispensación por su número.
      </p>
      <form
        noValidate
        aria-label="Abrir dispensación"
        className="flex items-end gap-2"
        onSubmit={abrir}
      >
        <Field label="Abrir dispensación #" error={error} className="w-40">
          <Input
            inputMode="numeric"
            autoComplete="off"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </Field>
        <Button type="submit" variante="secundario">
          Abrir
        </Button>
      </form>
      {recientes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-slate-600">Creadas en esta sesión:</span>
          {recientes.map((id) => (
            <Button
              key={id}
              variante="secundario"
              tamano="sm"
              aria-label={`Abrir dispensación #${id}`}
              onClick={() => onAbrir(id)}
            >
              #{id}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TarjetaPendiente({
  dispensacion: d,
  paciente,
  usuario,
  onAutorizada,
  onRechazar,
}: {
  dispensacion: DispensacionListado;
  /** Solo con el detalle (`GET /dispensaciones/{id}`). */
  paciente?: Paciente | undefined;
  usuario: Usuario;
  onAutorizada: (d: Dispensacion) => void;
  onRechazar: () => void;
}) {
  const [error, setError] = useState<unknown>(null);
  const pendiente = d.estado === 'PENDIENTE_AUTORIZACION';
  const propia = d.dispensado_por_id === usuario.id;
  const ayudaId = `segregacion-${d.id}`;
  const producto = productoDelError(error, d.items);

  const autorizar = useAccionUnica(async () => {
    setError(null);
    try {
      onAutorizada(await autorizarDispensacion(d.id));
    } catch (e) {
      setError(e);
    }
  });

  return (
    <li className="flex flex-col gap-2 py-3" aria-label={`Dispensación #${d.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">#{d.id}</span>
        {pendiente ? null : <EstadoBadge estado={d.estado} />}
        {paciente?.enmascarado ? <Badge tono="ambar">Datos enmascarados</Badge> : null}
      </div>
      {/* Primero lo que se autoriza */}
      <ul className="text-sm text-slate-800">
        {d.items.map((i) => (
          <li key={i.id}>
            {i.producto.nombre} · <span className="tabular-nums">{i.cantidad}</span> und.
            {i.producto.control_especial ? (
              <span className="ml-1.5">
                <Badge tono="violeta">Control especial</Badge>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {paciente ? (
        <p className="text-sm text-slate-700">
          Paciente: <span className="font-medium">{nombreCompleto(paciente)}</span>{' '}
          <span className="font-mono text-slate-600">
            {paciente.tipo_documento} {paciente.numero_documento}
          </span>
        </p>
      ) : null}
      {/* Luego quién y cuándo */}
      <p className="text-xs text-slate-500">
        Creada por{' '}
        <span className="font-medium text-slate-700">
          {nombreUsuario(d.dispensado_por_id, usuario, d.dispensado_por?.nombre)}
        </span>{' '}
        · {formatearFechaHora(d.created_at)}
      </p>
      {pendiente && propia ? (
        <p id={ayudaId} className="text-xs font-medium text-amber-800">
          {TEXTO_SEGREGACION}
        </p>
      ) : null}
      {pendiente ? null : (
        <p className="text-sm text-slate-600">No está pendiente de autorización.</p>
      )}
      {error ? (
        <ErrorBanner
          error={error}
          {...(producto ? { titulo: `No se pudo autorizar: falta stock de ${producto}` } : {})}
        />
      ) : null}
      {pendiente ? (
        <div className="flex gap-2 self-end">
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
            variante="peligroSecundario"
            disabled={propia || autorizar.pendiente}
            aria-describedby={propia ? ayudaId : undefined}
            onClick={onRechazar}
          >
            Rechazar
          </Button>
        </div>
      ) : null}
    </li>
  );
}
