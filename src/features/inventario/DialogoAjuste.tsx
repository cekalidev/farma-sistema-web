// Ajuste de inventario (solo regente): cantidad con signo y motivo
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { esApiError } from '../../api/client';
import { alertasKeys } from '../../api/endpoints/alertas';
import { inventarioKeys, registrarAjuste } from '../../api/endpoints/inventario';
import { kardexKeys } from '../../api/endpoints/kardex';
import { aplicarErroresAlFormulario } from '../../api/errores';
import type { Existencia } from '../../api/tipos';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { useAccionUnica } from '../../components/ui/useAccionUnica';

const MOTIVO_MIN = 10;
const MOTIVO_MAX = 500;
/** Tope por movimiento del backend (S-24, S-32). */
export const CANTIDAD_MAXIMA = 1_000_000;

export const esquemaAjuste = z.object({
  cantidad: z
    .number({ error: 'Escribe una cantidad entera, con signo (p. ej. -5 o 10).' })
    .int('Debe ser un número entero.')
    .min(-CANTIDAD_MAXIMA, `No puede ser menor que -${CANTIDAD_MAXIMA}.`)
    .max(CANTIDAD_MAXIMA, `No puede ser mayor que ${CANTIDAD_MAXIMA}.`)
    .refine((n) => n !== 0, 'La cantidad no puede ser 0.'),
  motivo: z
    .string()
    .regex(/^[^\r\n]*$/, 'El motivo no puede tener saltos de línea.')
    .trim()
    .min(MOTIVO_MIN, `Escribe al menos ${MOTIVO_MIN} caracteres.`)
    .max(MOTIVO_MAX, `Máximo ${MOTIVO_MAX} caracteres.`),
});

type DatosAjuste = z.infer<typeof esquemaAjuste>;

interface Props {
  existencia: Existencia;
  onCerrar: () => void;
}

export function DialogoAjuste({ existencia, onCerrar }: Props) {
  const id = useId();
  const queryClient = useQueryClient();
  const [errorServidor, setErrorServidor] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<DatosAjuste>({
    resolver: zodResolver(esquemaAjuste),
    defaultValues: { motivo: '' },
  });
  const cantidad = useWatch({ control, name: 'cantidad' });
  const motivo = useWatch({ control, name: 'motivo' }) ?? '';
  const resultante =
    typeof cantidad === 'number' && Number.isInteger(cantidad) && cantidad !== 0
      ? existencia.cantidad + cantidad
      : null;

  const enviar = useAccionUnica(async (datos: DatosAjuste) => {
    setErrorServidor(null);
    try {
      const mov = await registrarAjuste({
        existencia_id: existencia.id,
        cantidad: datos.cantidad,
        motivo: datos.motivo,
      });
      toast.success(
        `Ajuste registrado: ${existencia.producto.codigo} lote ${existencia.lote.codigo} queda en ${mov.saldo_posterior}.`,
      );
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: inventarioKeys.todo }),
        queryClient.invalidateQueries({ queryKey: kardexKeys.todo }),
        queryClient.invalidateQueries({ queryKey: alertasKeys.todo }),
      ]);
      onCerrar();
    } catch (e) {
      // El saldo cambió en el servidor: refresca la tabla
      if (esApiError(e) && e.codigo === 'STOCK_INSUFICIENTE') {
        void queryClient.invalidateQueries({ queryKey: inventarioKeys.todo });
      }
      const conCampos =
        esApiError(e) && e.codigo === 'VALIDACION' && aplicarErroresAlFormulario(e, setError);
      if (!conCampos) setErrorServidor(e);
    }
  });

  // Elemento con foco antes de abrir (se captura en el render, antes del autoFocus)
  const [previo] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => previo?.focus(), [previo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !enviar.pendiente) {
          e.stopPropagation();
          onCerrar();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-desc`}
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl"
      >
        <h2 id={`${id}-titulo`} className="text-base font-semibold">
          Ajustar inventario
        </h2>
        <p id={`${id}-desc`} className="mt-1 text-sm text-slate-600">
          {existencia.producto.codigo} · {existencia.producto.nombre} — lote{' '}
          {existencia.lote.codigo} en {existencia.bodega.nombre}. Saldo actual:{' '}
          <strong className="tabular-nums">{existencia.cantidad}</strong>.
        </p>
        <form
          noValidate
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => void handleSubmit((d) => enviar.ejecutar(d))(e)}
        >
          <Field
            label="Cantidad (con signo)"
            error={errors.cantidad?.message}
            ayuda={
              resultante === null ? (
                'Positiva suma unidades; negativa las descuenta.'
              ) : (
                <span className={resultante < 0 ? 'font-medium text-red-700' : undefined}>
                  Saldo resultante: <span className="tabular-nums">{resultante}</span>
                  {resultante < 0 ? ' (no puede quedar negativo)' : ''}
                </span>
              )
            }
          >
            <Input
              type="number"
              step={1}
              inputMode="numeric"
              autoFocus
              className="tabular-nums"
              {...register('cantidad', { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Motivo"
            error={errors.motivo?.message}
            ayuda={`Entre ${MOTIVO_MIN} y ${MOTIVO_MAX} caracteres, en una sola línea (${motivo.trim().length}/${MOTIVO_MAX}).`}
          >
            <Textarea
              rows={3}
              maxLength={MOTIVO_MAX}
              {...register('motivo')}
              onKeyDown={(e) => {
                // Enter envía en lugar de crear un salto de línea
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </Field>
          {errorServidor ? <ErrorBanner error={errorServidor} /> : null}
          <div className="flex justify-end gap-2">
            <Button variante="secundario" onClick={onCerrar} disabled={enviar.pendiente}>
              Cancelar
            </Button>
            <Button type="submit" pending={enviar.pendiente}>
              Confirmar ajuste
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
