// Pasos 3 (cantidades), 4 (previsualizar) y 5 (confirmar) de una prescripción elegida
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm, useWatch } from 'react-hook-form';
import {
  crearDispensacion,
  dispensacionesKeys,
  previsualizarDispensacion,
} from '../../api/endpoints/dispensaciones';
import { pacientesKeys } from '../../api/endpoints/pacientes';
import { esResultadoIncierto, manejarErrorDeFormulario } from '../../api/errores';
import { invalidarStock } from '../../api/invalidaciones';
import type {
  Paciente,
  Prescripcion,
  Previsualizacion,
  SolicitudDispensacion,
} from '../../api/tipos';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DialogoConfirmar } from '../../components/ui/DialogoConfirmar';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { CLASE_CONTENEDOR_TABLA, CLASE_TD, CLASE_TH, CLASE_THEAD } from '../../components/ui/Table';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import {
  borrarIntento,
  construirSolicitud,
  esquemaItems,
  guardarIntento,
  itemAfectado,
  mapaCamposServidor,
  pendienteDe,
  refrescaPrescripcion,
  serializarSolicitud,
  valoresIniciales,
  type GestorClave,
  type IntentoPendiente,
  type ValoresItems,
} from './logica';
import { Resultado, type ResultadoDispensacion } from './Resultado';
import { TablaLotes } from './TablaLotes';

export const TITULO_ERROR_RED =
  'No se pudo confirmar si la dispensación se registró. Reintentar es seguro: no se duplicará.';
export const TEXTO_DESCARTAR =
  'Si el servidor llegó a registrarla, empezar de nuevo y volver a confirmar puede dispensar dos veces los mismos medicamentos. Descarta solo si sabes que no se registró (por ejemplo, revisando el kardex).';

interface Props {
  paciente: Paciente;
  prescripcion: Prescripcion;
  bodegaId: number | null;
  gestorClave: GestorClave;
  /** El resultado bloquea los pasos anteriores hasta "Nueva dispensación". */
  onFinalizada: () => void;
  /** Resultado incierto: bodega, paciente y prescripción quedan bloqueados. */
  onCongelar: (congelado: boolean) => void;
  /** Quedó PENDIENTE_AUTORIZACION: el panel la recuerda como acceso rápido. */
  onPendienteCreada: (id: number) => void;
  onNueva: () => void;
}

interface Previa {
  firma: string;
  solicitud: SolicitudDispensacion;
  datos: Previsualizacion;
}

interface ErrorConFirma {
  error: unknown;
  firma: string | null;
}

export function FlujoDispensacion({
  paciente,
  prescripcion,
  bodegaId,
  gestorClave,
  onFinalizada,
  onCongelar,
  onPendienteCreada,
  onNueva,
}: Props) {
  const queryClient = useQueryClient();
  const esquema = useMemo(() => esquemaItems(prescripcion.items), [prescripcion.items]);
  const {
    register,
    handleSubmit,
    control,
    setError,
    getValues,
    formState: { errors },
  } = useForm<ValoresItems>({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(prescripcion),
  });
  const valores = useWatch({ control });

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [errorPrevia, setErrorPrevia] = useState<ErrorConFirma | null>(null);
  const [errorConfirmar, setErrorConfirmar] = useState<ErrorConFirma | null>(null);
  const [resultado, setResultado] = useState<ResultadoDispensacion | null>(null);
  // Envío sin respuesta clara (red o 5xx): cuerpo congelado, solo Reintentar con la misma clave
  const [incierto, setIncierto] = useState<IntentoPendiente | null>(null);
  const [descartando, setDescartando] = useState(false);
  const confirmarRef = useRef<HTMLDivElement>(null);

  // Firma del cuerpo actual: si difiere de la previsualizada, hay que volver a previsualizar
  const firmaActual =
    bodegaId === null
      ? null
      : serializarSolicitud(
          construirSolicitud(paciente.id, prescripcion.id, bodegaId, {
            items: (valores.items ?? []).map((i) => ({
              prescripcion_item_id: i?.prescripcion_item_id ?? 0,
              cantidad: typeof i?.cantidad === 'number' ? i.cantidad : Number.NaN,
            })),
          }),
        );
  const previaVigente = previa && previa.firma === firmaActual ? previa : null;
  const errPrevia = errorPrevia && errorPrevia.firma === firmaActual ? errorPrevia.error : null;
  const errConfirmar =
    errorConfirmar && errorConfirmar.firma === firmaActual ? errorConfirmar.error : null;
  const resaltado = itemAfectado(errConfirmar) ?? itemAfectado(errPrevia);
  const finalizada = resultado !== null;
  const congelado = incierto !== null;

  const refrescarPrescripciones = () =>
    void queryClient.invalidateQueries({ queryKey: pacientesKeys.prescripciones(paciente.id) });

  const previsualizar = useAccionUnica(async (v: ValoresItems) => {
    if (bodegaId === null) return;
    const solicitud = construirSolicitud(paciente.id, prescripcion.id, bodegaId, v);
    const firma = serializarSolicitud(solicitud);
    setErrorPrevia(null);
    setErrorConfirmar(null);
    try {
      const datos = await previsualizarDispensacion(solicitud);
      flushSync(() => setPrevia({ firma, solicitud, datos }));
      confirmarRef.current?.querySelector('button')?.focus();
    } catch (e) {
      setPrevia(null);
      if (refrescaPrescripcion(e)) refrescarPrescripciones();
      const pendiente = manejarErrorDeFormulario(e, setError, mapaCamposServidor(solicitud, v));
      if (pendiente) setErrorPrevia({ error: pendiente, firma });
    }
  });

  const enviar = async (solicitud: SolicitudDispensacion, firma: string) => {
    setErrorConfirmar(null);
    let clave: string | null = null;
    try {
      // Misma firma → misma clave (reintento seguro); firma nueva → clave nueva
      clave = gestorClave.claveParaCuerpo(firma);
      const r = await crearDispensacion(solicitud, clave);
      gestorClave.olvidar();
      borrarIntento();
      setIncierto(null);
      setResultado(r);
      onFinalizada();
      if (r.dispensacion.estado === 'PENDIENTE_AUTORIZACION') onPendienteCreada(r.dispensacion.id);
      refrescarPrescripciones();
      void queryClient.invalidateQueries({ queryKey: dispensacionesKeys.todo });
      void invalidarStock(queryClient);
    } catch (e) {
      if (clave !== null && esResultadoIncierto(e)) {
        const intento = { clave, firmaCuerpo: firma, cuerpo: solicitud };
        guardarIntento(intento);
        setIncierto(intento);
        onCongelar(true);
        setErrorConfirmar({ error: e, firma });
        return;
      }
      // 4xx de negocio: la clave no se consumió; se puede corregir y reenviar
      borrarIntento();
      if (incierto) {
        setIncierto(null);
        onCongelar(false);
      }
      if (refrescaPrescripcion(e)) refrescarPrescripciones();
      const pendiente = manejarErrorDeFormulario(
        e,
        setError,
        mapaCamposServidor(solicitud, getValues()),
      );
      if (pendiente) setErrorConfirmar({ error: pendiente, firma });
    }
  };

  const confirmar = useAccionUnica(async () => {
    if (incierto) return enviar(incierto.cuerpo, incierto.firmaCuerpo);
    if (previaVigente) return enviar(previaVigente.solicitud, previaVigente.firma);
  });

  const descartar = () => {
    borrarIntento();
    gestorClave.olvidar();
    setDescartando(false);
    setIncierto(null);
    onNueva();
  };

  const hayControlEspecial = previaVigente?.datos.items.some((i) => i.producto.control_especial);

  return (
    <>
      <form
        noValidate
        aria-label="Cantidades a dispensar"
        onSubmit={(e) => void handleSubmit((v) => previsualizar.ejecutar(v))(e)}
      >
        <fieldset disabled={finalizada || congelado} className="flex min-w-0 flex-col gap-2">
          <legend className="sr-only">Ítems de la prescripción {prescripcion.id}</legend>
          <div className={CLASE_CONTENEDOR_TABLA}>
            <table className="min-w-full text-sm">
              <caption className="sr-only">Ítems de la prescripción</caption>
              <thead className={CLASE_THEAD}>
                <tr>
                  <th scope="col" className={`${CLASE_TH} text-left`}>
                    Producto
                  </th>
                  <th scope="col" className={`${CLASE_TH} text-right`}>
                    Prescrita
                  </th>
                  <th scope="col" className={`${CLASE_TH} text-right`}>
                    Pendiente
                  </th>
                  <th scope="col" className={`${CLASE_TH} w-40 text-right`}>
                    A dispensar
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescripcion.items.map((item, idx) => {
                  const pendiente = pendienteDe(item);
                  const error = errors.items?.[idx]?.cantidad?.message;
                  const marcado = resaltado === item.id;
                  return (
                    <tr
                      key={item.id}
                      data-resaltado={marcado || undefined}
                      className={
                        marcado ? 'bg-red-50 outline-2 -outline-offset-2 outline-red-500' : ''
                      }
                    >
                      <td className={CLASE_TD}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.producto.nombre}</span>
                          <span className="font-mono text-xs text-slate-500">
                            {item.producto.codigo}
                          </span>
                          {item.producto.control_especial ? (
                            <Badge tono="violeta">Control especial</Badge>
                          ) : null}
                          {marcado ? (
                            <span className="text-xs font-semibold text-red-700">
                              Revisa este ítem
                            </span>
                          ) : null}
                        </div>
                        {item.indicaciones ? (
                          <p className="text-xs text-slate-500">{item.indicaciones}</p>
                        ) : null}
                      </td>
                      <td className={`${CLASE_TD} text-right tabular-nums`}>
                        {item.cantidad_prescrita}
                      </td>
                      <td className={`${CLASE_TD} text-right tabular-nums`}>{pendiente}</td>
                      <td className={`${CLASE_TD} text-right`}>
                        {pendiente > 0 ? (
                          <>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={pendiente}
                              step={1}
                              aria-label={`Cantidad a dispensar de ${item.producto.nombre}`}
                              aria-invalid={error ? true : undefined}
                              aria-describedby={error ? `error-item-${item.id}` : undefined}
                              className="h-8 w-24 rounded-md border border-slate-300 bg-white px-2 text-right text-sm tabular-nums disabled:bg-slate-100 aria-[invalid=true]:border-red-600"
                              {...register(`items.${idx}.cantidad`, { valueAsNumber: true })}
                            />
                            {error ? (
                              <p
                                id={`error-item-${item.id}`}
                                className="mt-0.5 text-xs font-medium text-red-700"
                              >
                                {error}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-slate-500">Sin pendiente</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errors.root?.message ? (
            <p className="text-sm font-medium text-red-700">{errors.root.message}</p>
          ) : null}
          <p className="text-xs text-slate-500">0 = no se dispensa ese ítem. Enter previsualiza.</p>

          <section aria-labelledby="paso-4" className="mt-2 flex flex-col gap-2">
            <h2 id="paso-4" className="text-sm font-semibold text-slate-800">
              4. Previsualizar lotes (FEFO)
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                variante="secundario"
                pending={previsualizar.pendiente}
                disabled={bodegaId === null}
              >
                Previsualizar
              </Button>
              {bodegaId === null ? (
                <span className="text-sm text-amber-800">Elige una bodega primero.</span>
              ) : null}
              {previa && !previaVigente && !finalizada ? (
                <span role="status" className="text-sm text-amber-800">
                  Los datos cambiaron: vuelve a previsualizar.
                </span>
              ) : null}
            </div>
            {errPrevia ? <ErrorBanner error={errPrevia} titulo="No se pudo previsualizar" /> : null}
            <div aria-live="polite">
              {previaVigente && !finalizada ? (
                <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-600">
                    Asignación orientativa: se recalcula al confirmar.
                  </p>
                  {hayControlEspecial ? (
                    <p className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900">
                      Incluye medicamento de control especial: quedará PENDIENTE DE AUTORIZACIÓN por
                      un regente distinto a quien dispensa.
                    </p>
                  ) : null}
                  <TablaLotes
                    items={previaVigente.datos.items}
                    detalles={previaVigente.datos.detalles}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </fieldset>
      </form>

      <section aria-labelledby="paso-5" className="flex flex-col gap-2">
        <h2 id="paso-5" className="text-sm font-semibold text-slate-800">
          5. Confirmar dispensación
        </h2>
        {finalizada || congelado ? null : (
          <div ref={confirmarRef} className="flex flex-wrap items-center gap-2">
            <Button
              pending={confirmar.pendiente}
              disabled={!previaVigente}
              onClick={() => void confirmar.ejecutar()}
            >
              Confirmar dispensación
            </Button>
            {!previaVigente ? (
              <span className="text-sm text-slate-500">Previsualiza antes de confirmar.</span>
            ) : null}
          </div>
        )}
        {congelado ? (
          <ErrorBanner
            error={errorConfirmar?.error ?? incierto}
            titulo={TITULO_ERROR_RED}
            extra={
              <div className="flex flex-col gap-2">
                <p>Los datos quedan bloqueados para reintentar exactamente el mismo envío.</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    tamano="sm"
                    pending={confirmar.pendiente}
                    onClick={() => void confirmar.ejecutar()}
                  >
                    Reintentar
                  </Button>
                  <Button
                    tamano="sm"
                    variante="peligroSecundario"
                    disabled={confirmar.pendiente}
                    onClick={() => setDescartando(true)}
                  >
                    Descartar y empezar de nuevo
                  </Button>
                </div>
              </div>
            }
          />
        ) : errConfirmar ? (
          <ErrorBanner error={errConfirmar} titulo="No se registró la dispensación" />
        ) : null}
        <DialogoConfirmar
          abierto={descartando}
          titulo="¿Descartar la dispensación sin confirmar?"
          texto={TEXTO_DESCARTAR}
          etiquetaConfirmar="Descartar"
          variante="peligro"
          onConfirmar={descartar}
          onCerrar={() => setDescartando(false)}
        />
        <div aria-live="polite">
          {resultado ? <Resultado {...resultado} onNueva={onNueva} /> : null}
        </div>
      </section>
    </>
  );
}
