// Dispensación: bodega → paciente → prescripción → cantidades → previsualizar → confirmar
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { catalogosKeys, listarBodegas } from '../../api/endpoints/catalogos';
import {
  buscarPacientes,
  listarPrescripciones,
  pacientesKeys,
} from '../../api/endpoints/pacientes';
import type { BusquedaPaciente, Paciente, TipoDocumento } from '../../api/tipos';
import { puede } from '../../auth/permisos';
import { useAuth } from '../../auth/useAuth';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Cargando } from '../../components/ui/Cargando';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Field, Input, Select } from '../../components/ui/Field';
import { formatearFecha } from '../../lib/fechas';
import { nuevoUuid } from '../../lib/uuid';
import { FlujoDispensacion } from './FlujoDispensacion';
import { IntentoRecuperado } from './IntentoRecuperado';
import {
  crearGestorClave,
  guardarPendientesSesion,
  leerIntento,
  leerPendientesSesion,
  motivoNoVigente,
  nombreCompleto,
  textoEdad,
} from './logica';
import { PanelPendientes } from './PanelPendientes';

export const CLAVE_BODEGA = 'farma.dispensacion.bodega';
const TIPOS: TipoDocumento[] = ['CC', 'TI', 'CE', 'PA', 'RC'];

function leerBodega(): number | null {
  try {
    const v = Number(sessionStorage.getItem(CLAVE_BODEGA));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function guardarBodega(id: number | null): void {
  try {
    if (id === null) sessionStorage.removeItem(CLAVE_BODEGA);
    else sessionStorage.setItem(CLAVE_BODEGA, String(id));
  } catch {
    // Sin almacenamiento: solo no se recuerda
  }
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`paso-${n}`}
      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 id={`paso-${n}`} className="text-sm font-semibold text-slate-800">
        {n}. {titulo}
      </h2>
      {children}
    </section>
  );
}

export default function PantallaDispensacion() {
  const { usuario } = useAuth();
  const [bodegaElegida, setBodegaElegida] = useState<number | null>(leerBodega);
  const [tipo, setTipo] = useState<TipoDocumento | ''>('');
  const [numero, setNumero] = useState('');
  const [errorNumero, setErrorNumero] = useState<string | undefined>();
  const [busqueda, setBusqueda] = useState<BusquedaPaciente | null>(null);
  const [pacienteId, setPacienteId] = useState<number | null>(null);
  const [prescripcionId, setPrescripcionId] = useState<number | null>(null);
  const [finalizada, setFinalizada] = useState(false);
  const [congelado, setCongelado] = useState(false);
  const [ronda, setRonda] = useState(0);
  // Envío incierto guardado antes de una recarga (se lee una vez, al montar)
  const [recuperado, setRecuperado] = useState(leerIntento);
  // La clave sobrevive a re-montajes y recargas: un reintento con el mismo cuerpo la reutiliza
  const [gestorClave] = useState(() =>
    crearGestorClave(
      nuevoUuid,
      recuperado ? { clave: recuperado.clave, cuerpo: recuperado.firmaCuerpo } : null,
    ),
  );
  const [recientes, setRecientes] = useState(leerPendientesSesion);
  const recordarPendiente = (id: number) =>
    setRecientes((r) => {
      const ids = r.includes(id) ? r : [...r, id];
      guardarPendientesSesion(ids);
      return ids;
    });
  const olvidarPendiente = (id: number) =>
    setRecientes((r) => {
      if (!r.includes(id)) return r;
      const ids = r.filter((x) => x !== id);
      guardarPendientesSesion(ids);
      return ids;
    });
  const bloqueada = finalizada || congelado;
  const busquedaRef = useRef<HTMLFormElement>(null);

  const bodegas = useQuery({
    queryKey: catalogosKeys.bodegas(1),
    queryFn: ({ signal }) => listarBodegas(1, signal),
  });
  const activas = bodegas.data?.data.filter((b) => b.activa) ?? [];
  const bodegaId =
    activas.find((b) => b.id === bodegaElegida)?.id ??
    (activas.length === 1 ? (activas[0]?.id ?? null) : null);

  // RN-10: cada consulta de pacientes queda en la bitácora; solo las que pide el usuario
  // (sin refetch al enfocar ni por datos "viejos").
  const pacientes = useQuery({
    queryKey: pacientesKeys.busqueda(busqueda ?? { numero_documento: '' }),
    queryFn: () => buscarPacientes(busqueda ?? { numero_documento: '' }),
    enabled: busqueda !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const resultados = pacientes.data ?? [];
  const paciente: Paciente | null =
    resultados.find((p) => p.id === pacienteId) ??
    (resultados.length === 1 ? (resultados[0] ?? null) : null);

  const prescripciones = useQuery({
    queryKey: pacientesKeys.prescripciones(paciente?.id ?? 0),
    queryFn: ({ signal }) => listarPrescripciones(paciente?.id ?? 0, signal),
    enabled: paciente !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const listaPresc = prescripciones.data ?? [];
  const vigentes = listaPresc.filter((p) => motivoNoVigente(p) === null);
  const prescripcion =
    vigentes.find((p) => p.id === prescripcionId) ??
    (vigentes.length === 1 ? (vigentes[0] ?? null) : null);

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    const n = numero.trim();
    if (!n) {
      setErrorNumero('Escribe el número de documento.');
      return;
    }
    setErrorNumero(undefined);
    setBusqueda({ ...(tipo ? { tipo_documento: tipo } : {}), numero_documento: n });
    setPacienteId(null);
    setPrescripcionId(null);
  };

  const nueva = () => {
    flushSync(() => {
      setBusqueda(null);
      setNumero('');
      setTipo('');
      setPacienteId(null);
      setPrescripcionId(null);
      setFinalizada(false);
      setCongelado(false);
      setRonda((r) => r + 1);
    });
    busquedaRef.current?.querySelector<HTMLInputElement>('input[name="numero_documento"]')?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Dispensación</h1>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          {recuperado ? (
            <IntentoRecuperado
              intento={recuperado}
              onPendienteCreada={recordarPendiente}
              onCerrar={() => {
                gestorClave.olvidar();
                setRecuperado(null);
              }}
            />
          ) : null}
          <fieldset disabled={bloqueada} className="contents">
            <Paso n={1} titulo="Bodega">
              {bodegas.isError ? (
                <ErrorBanner error={bodegas.error} onReintentar={() => void bodegas.refetch()} />
              ) : (
                <Field label="Bodega que dispensa" className="max-w-sm">
                  <Select
                    value={bodegaId ?? ''}
                    disabled={bodegas.isPending}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      setBodegaElegida(id);
                      guardarBodega(id);
                    }}
                  >
                    <option value="">
                      {bodegas.isPending ? 'Cargando…' : 'Selecciona la bodega'}
                    </option>
                    {activas.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.codigo} · {b.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </Paso>

            <Paso n={2} titulo="Buscar paciente">
              <form
                ref={busquedaRef}
                noValidate
                role="search"
                aria-label="Buscar paciente"
                className="flex flex-wrap items-end gap-2"
                onSubmit={buscar}
              >
                <Field label="Tipo de documento" className="w-36">
                  <Select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoDocumento | '')}
                  >
                    <option value="">Cualquiera</option>
                    {TIPOS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Número de documento" error={errorNumero} className="w-56">
                  <Input
                    name="numero_documento"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="off"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                  />
                </Field>
                <Button type="submit" pending={pacientes.isFetching}>
                  Buscar
                </Button>
              </form>
              <div aria-live="polite">
                {pacientes.isError ? (
                  <ErrorBanner error={pacientes.error} />
                ) : busqueda && pacientes.isSuccess && resultados.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No se encontró ningún paciente con el documento {busqueda.numero_documento}.
                    Revisa el número o el tipo de documento.
                  </p>
                ) : resultados.length > 0 ? (
                  <ul className="flex flex-col gap-1" aria-label="Pacientes encontrados">
                    {resultados.map((p) => {
                      const elegido = paciente?.id === p.id;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            aria-pressed={elegido}
                            onClick={() => {
                              setPacienteId(p.id);
                              setPrescripcionId(null);
                            }}
                            className={`flex w-full flex-wrap items-baseline gap-x-3 rounded-md border px-3 py-1.5 text-left text-sm ${
                              elegido
                                ? 'border-marca-700 bg-marca-50 ring-1 ring-marca-700'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="font-medium">{nombreCompleto(p)}</span>
                            <span className="font-mono text-slate-600">
                              {p.tipo_documento} {p.numero_documento}
                            </span>
                            <span className="text-slate-500">{textoEdad(p)}</span>
                            {p.enmascarado ? <Badge tono="ambar">Datos enmascarados</Badge> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </Paso>
          </fieldset>

          {paciente ? (
            <Paso n={3} titulo={`Prescripciones de ${nombreCompleto(paciente)}`}>
              {prescripciones.isPending ? (
                <Cargando texto="Cargando prescripciones…" />
              ) : prescripciones.isError ? (
                <ErrorBanner
                  error={prescripciones.error}
                  onReintentar={() => void prescripciones.refetch()}
                />
              ) : listaPresc.length === 0 ? (
                <p className="text-sm text-slate-600">El paciente no tiene prescripciones.</p>
              ) : (
                <fieldset disabled={bloqueada} className="contents">
                  <legend className="sr-only">Prescripción a dispensar</legend>
                  <ul className="flex flex-col gap-1" aria-label="Prescripciones">
                    {listaPresc.map((p) => {
                      const motivo = motivoNoVigente(p);
                      const elegida = prescripcion?.id === p.id;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            disabled={motivo !== null}
                            aria-pressed={elegida}
                            onClick={() => setPrescripcionId(p.id)}
                            className={`flex w-full flex-wrap items-baseline gap-x-3 rounded-md border px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
                              elegida
                                ? 'border-marca-700 bg-marca-50 ring-1 ring-marca-700'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <span className="font-medium">Prescripción #{p.id}</span>
                            <span>Emitida {formatearFecha(p.fecha_emision)}</span>
                            <span className="text-slate-500">
                              {p.items.map((i) => i.producto.nombre).join(', ')}
                            </span>
                            {motivo ? (
                              <span className="font-medium text-red-700">{motivo}</span>
                            ) : (
                              <span className="text-slate-500">
                                Vence {formatearFecha(p.fecha_vencimiento)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
              {prescripcion ? (
                <FlujoDispensacion
                  key={`${ronda}-${paciente.id}-${prescripcion.id}`}
                  paciente={paciente}
                  prescripcion={prescripcion}
                  bodegaId={bodegaId}
                  gestorClave={gestorClave}
                  onFinalizada={() => setFinalizada(true)}
                  onCongelar={setCongelado}
                  onPendienteCreada={recordarPendiente}
                  onNueva={nueva}
                />
              ) : null}
            </Paso>
          ) : null}
        </div>

        {puede(usuario, 'dispensacion.autorizar') && usuario ? (
          <PanelPendientes
            usuario={usuario}
            bodegaId={bodegaId}
            recientes={recientes}
            onOlvidar={olvidarPendiente}
          />
        ) : null}
      </div>
    </div>
  );
}
