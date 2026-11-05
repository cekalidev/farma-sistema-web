// Formulario de recepción: una fila por ítem con la cantidad recibida (0..enviada)
import { useState } from 'react';
import type { RecepcionTraslado, Traslado } from '../../api/tipos';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { CLASE_CONTENEDOR_TABLA, CLASE_TD, CLASE_TH, CLASE_THEAD } from '../../components/ui/Table';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import { formatearFecha } from '../../lib/fechas';

interface Props {
  traslado: Traslado;
  /** Si lanza, el error se muestra en el formulario. */
  onConfirmar: (datos: RecepcionTraslado) => Promise<unknown>;
  onCancelar: () => void;
}

function errorCantidad(valor: string, enviada: number): string | null {
  if (valor.trim() === '') return 'Escribe la cantidad.';
  const n = Number(valor);
  if (!Number.isInteger(n)) return 'Debe ser un número entero.';
  if (n < 0) return 'No puede ser negativa.';
  if (n > enviada) return `No puede superar lo enviado (${enviada}).`;
  return null;
}

export function Recepcion({ traslado, onConfirmar, onCancelar }: Props) {
  const completo = () =>
    Object.fromEntries(traslado.items.map((it) => [it.id, String(it.cantidad)]));
  const [valores, setValores] = useState<Record<number, string>>(completo);
  const [errorServidor, setErrorServidor] = useState<unknown>(null);
  const [intentado, setIntentado] = useState(false);

  const errores = traslado.items.map((it) => errorCantidad(valores[it.id] ?? '', it.cantidad));
  const hayErrores = errores.some(Boolean);
  const faltante = hayErrores
    ? 0
    : traslado.items.reduce((s, it) => s + (it.cantidad - Number(valores[it.id])), 0);

  const enviar = useAccionUnica(async () => {
    setErrorServidor(null);
    try {
      await onConfirmar({
        items: traslado.items.map((it) => ({
          traslado_item_id: it.id,
          cantidad_recibida: Number(valores[it.id]),
        })),
      });
    } catch (e) {
      setErrorServidor(e);
    }
  });

  return (
    <form
      noValidate
      aria-labelledby="titulo-recepcion"
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setIntentado(true);
        if (!hayErrores) void enviar.ejecutar();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-recepcion" className="text-base font-semibold">
          Registrar recepción
        </h2>
        <Button
          variante="secundario"
          tamano="sm"
          onClick={() => setValores(completo())}
          disabled={enviar.pendiente}
        >
          Recibir todo completo
        </Button>
      </div>
      <div className={CLASE_CONTENEDOR_TABLA}>
        <table className="min-w-full text-sm">
          <caption className="sr-only">Cantidades recibidas por ítem</caption>
          <thead className={CLASE_THEAD}>
            <tr>
              <th scope="col" className={`${CLASE_TH} text-left`}>
                Producto
              </th>
              <th scope="col" className={`${CLASE_TH} hidden text-left sm:table-cell`}>
                Lote
              </th>
              <th scope="col" className={`${CLASE_TH} text-right`}>
                Enviada
              </th>
              <th scope="col" className={`${CLASE_TH} text-left`}>
                Recibida
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {traslado.items.map((it, i) => {
              const error = intentado || valores[it.id] !== String(it.cantidad) ? errores[i] : null;
              const idError = `recepcion-error-${it.id}`;
              return (
                <tr key={it.id} className="align-top">
                  <td className={CLASE_TD}>
                    {it.producto.nombre}
                    <span className="block font-mono text-xs whitespace-nowrap text-slate-600 sm:hidden">
                      {it.lote.codigo}
                    </span>
                  </td>
                  <td className={`${CLASE_TD} hidden whitespace-nowrap sm:table-cell`}>
                    <span className="font-mono text-xs">{it.lote.codigo}</span>{' '}
                    <span className="text-xs text-slate-500">
                      (vence {formatearFecha(it.lote.fecha_vencimiento)})
                    </span>
                  </td>
                  <td className={`${CLASE_TD} text-right tabular-nums`}>{it.cantidad}</td>
                  <td className={CLASE_TD}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={it.cantidad}
                      step={1}
                      aria-label={`Cantidad recibida de ${it.producto.nombre} (${it.lote.codigo})`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? idError : undefined}
                      className="h-8 w-20 rounded-md border border-slate-300 px-2 text-right text-sm tabular-nums aria-[invalid=true]:border-peligro-600"
                      value={valores[it.id] ?? ''}
                      onChange={(e) => setValores((v) => ({ ...v, [it.id]: e.target.value }))}
                    />
                    {error ? (
                      <p
                        id={idError}
                        className="mt-0.5 max-w-32 text-xs font-medium text-peligro-700"
                      >
                        {error}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {faltante > 0 ? (
        <p
          role="status"
          className="rounded-md border border-aviso-300 bg-aviso-50 px-3 py-2 text-sm text-aviso-900"
        >
          Se registrará una discrepancia de {faltante} unidades pendiente de resolución por un
          regente.
        </p>
      ) : null}
      {errorServidor ? <ErrorBanner error={errorServidor} /> : null}
      <div className="flex justify-end gap-2">
        <Button variante="secundario" onClick={onCancelar} disabled={enviar.pendiente}>
          Cancelar
        </Button>
        <Button type="submit" pending={enviar.pendiente}>
          Confirmar recepción
        </Button>
      </div>
    </form>
  );
}
