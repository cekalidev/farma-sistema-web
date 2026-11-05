// Formulario de recepción: una fila por ítem con la cantidad recibida (0..enviada)
import { useState } from 'react';
import type { RecepcionTraslado, Traslado } from '../../api/tipos';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
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
      className="flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50/40 p-4"
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
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600 uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                Producto
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Lote
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Enviada
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                Recibida
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {traslado.items.map((it, i) => {
              const error = intentado || valores[it.id] !== String(it.cantidad) ? errores[i] : null;
              const idError = `recepcion-error-${it.id}`;
              return (
                <tr key={it.id}>
                  <td className="px-3 py-1.5">{it.producto.nombre}</td>
                  <td className="px-3 py-1.5">
                    {it.lote.codigo}{' '}
                    <span className="text-xs text-slate-500">
                      (vence {formatearFecha(it.lote.fecha_vencimiento)})
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{it.cantidad}</td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={it.cantidad}
                      step={1}
                      aria-label={`Cantidad recibida de ${it.producto.nombre} (${it.lote.codigo})`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? idError : undefined}
                      className="h-8 w-24 rounded-md border border-slate-300 px-2 text-right text-sm tabular-nums aria-[invalid=true]:border-red-600"
                      value={valores[it.id] ?? ''}
                      onChange={(e) => setValores((v) => ({ ...v, [it.id]: e.target.value }))}
                    />
                    {error ? (
                      <p id={idError} className="text-xs font-medium text-red-700">
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
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
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
