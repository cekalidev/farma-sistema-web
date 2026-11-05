// Pasos 3 (cantidades), 4 (previsualizar) y 5 (confirmar) de una prescripción elegida
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm, useWatch } from 'react-hook-form';
import { esApiError } from '../../api/client';
import {
  crearDispensacion,
  dispensacionesKeys,
  previsualizarDispensacion,
} from '../../api/endpoints/dispensaciones';
import { pacientesKeys } from '../../api/endpoints/pacientes';
import { manejarErrorDeFormulario } from '../../api/errores';
import type {
  Dispensacion,
  Paciente,
  Prescripcion,
  Previsualizacion,
  SolicitudDispensacion,
} from '../../api/tipos';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import {
  construirSolicitud,
  esquemaItems,
  itemAfectado,
  mapaCamposServidor,
  pendienteDe,
  serializarSolicitud,
  valoresIniciales,
  type GestorClave,
  type ValoresItems,
} from './logica';
import { TablaLotes } from './TablaLotes';

export const TITULO_ERROR_RED =
  'No se pudo confirmar si la dispensación se registró. Reintentar es seguro: no se duplicará.';

interface Props {
  paciente: Paciente;
  prescripcion: Prescripcion;
  bodegaId: number | null;
  gestorClave: GestorClave;
  /** El resultado bloquea los pasos anteriores hasta "Nueva dispensación". */
  onFinalizada: () => void;
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
  onNueva,
}: Props) {
  const queryClient = useQueryClient();
  const esquema = useMemo(() => esquemaItems(prescripcion.items), [prescripcion.items]);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<ValoresItems>({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales(prescripcion),
  });
  const valores = useWatch({ control });

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [errorPrevia, setErrorPrevia] = useState<ErrorConFirma | null>(null);
  const [errorConfirmar, setErrorConfirmar] = useState<ErrorConFirma | null>(null);
  const [resultado, setResultado] = useState<{
    dispensacion: Dispensacion;
    replayed: boolean;
  } | null>(null);
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
      const pendiente = manejarErrorDeFormulario(e, setError, mapaCamposServidor(solicitud, v));
      if (pendiente) setErrorPrevia({ error: pendiente, firma });
    }
  });

  const confirmar = useAccionUnica(async () => {
    if (!previaVigente) return;
    const { solicitud, firma } = previaVigente;
    // Misma firma → misma clave (reintento seguro); firma nueva → clave nueva
    const clave = gestorClave.claveParaCuerpo(firma);
    setErrorConfirmar(null);
    try {
      const r = await crearDispensacion(solicitud, clave);
      gestorClave.olvidar();
      setResultado(r);
      onFinalizada();
      void queryClient.invalidateQueries({ queryKey: pacientesKeys.prescripciones(paciente.id) });
      void queryClient.invalidateQueries({ queryKey: dispensacionesKeys.todo });
    } catch (e) {
      const pendiente = manejarErrorDeFormulario(
        e,
        setError,
        mapaCamposServidor(solicitud, valoresIniciales(prescripcion)),
      );
      if (pendiente) setErrorConfirmar({ error: pendiente, firma });
    }
  });

  const hayControlEspecial = previaVigente?.datos.items.some((i) => i.producto.control_especial);
  const errorRed = esApiError(errConfirmar) && errConfirmar.codigo === 'RED';

  return (
    <>
      <form
        noValidate
        aria-label="Cantidades a dispensar"
        onSubmit={(e) => void handleSubmit((v) => previsualizar.ejecutar(v))(e)}
      >
        <fieldset disabled={finalizada} className="flex flex-col gap-2">
          <legend className="sr-only">Ítems de la prescripción {prescripcion.id}</legend>
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Ítems de la prescripción</caption>
              <thead className="bg-slate-100 text-xs tracking-wide text-slate-600 uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Producto
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Prescrita
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Pendiente
                  </th>
                  <th scope="col" className="w-40 px-3 py-2 text-right font-semibold">
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
                      <td className="px-3 py-1.5">
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
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {item.cantidad_prescrita}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{pendiente}</td>
                      <td className="px-3 py-1.5 text-right">
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
        {finalizada ? null : (
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
        {errConfirmar ? (
          errorRed ? (
            <ErrorBanner
              error={errConfirmar}
              titulo={TITULO_ERROR_RED}
              onReintentar={() => void confirmar.ejecutar()}
            />
          ) : (
            <ErrorBanner error={errConfirmar} titulo="No se registró la dispensación" />
          )
        ) : null}
        <div aria-live="polite">
          {resultado ? <Resultado {...resultado} onNueva={onNueva} /> : null}
        </div>
      </section>
    </>
  );
}

function Resultado({
  dispensacion: d,
  replayed,
  onNueva,
}: {
  dispensacion: Dispensacion;
  replayed: boolean;
  onNueva: () => void;
}) {
  const pendiente = d.estado === 'PENDIENTE_AUTORIZACION';
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-3 ${
        pendiente ? 'border-amber-400 bg-amber-50' : 'border-emerald-300 bg-emerald-50'
      }`}
    >
      {pendiente ? (
        <>
          <p className="text-base font-semibold text-amber-900">
            Dispensación #{d.id}: pendiente de autorización por un regente distinto
          </p>
          <p className="text-sm text-amber-900">
            No se descontó stock. Se entregará cuando otro regente la autorice.
          </p>
        </>
      ) : (
        <p className="text-base font-semibold text-emerald-900">
          Dispensación #{d.id} confirmada. Lotes descontados:
        </p>
      )}
      {replayed ? (
        <p className="text-sm text-slate-700">
          Esta dispensación ya estaba registrada; se muestra el resultado original.
        </p>
      ) : null}
      <TablaLotes
        items={d.items}
        detalles={d.detalles}
        sinLotes={pendiente ? 'Se asignará al autorizar.' : 'Sin lotes.'}
      />
      <div>
        <Button autoFocus onClick={onNueva}>
          Nueva dispensación
        </Button>
      </div>
    </div>
  );
}
