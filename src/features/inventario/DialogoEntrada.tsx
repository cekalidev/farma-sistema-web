// Entrada de inventario (solo regente): lote existente o nuevo
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { registrarEntrada } from '../../api/endpoints/inventario';
import { manejarErrorDeFormulario } from '../../api/errores';
import { invalidarStock } from '../../api/invalidaciones';
import type { EntradaInventario } from '../../api/tipos';
import { Button } from '../../components/ui/Button';
import { Dialogo } from '../../components/ui/Dialogo';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Field, Input, Select } from '../../components/ui/Field';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import { diasHastaVencer, formatearFecha } from '../../lib/fechas';
import { CANTIDAD_MAXIMA } from './DialogoAjuste';
import { useBodegas, useLotesDeProducto, useProductos } from './filtros';

const id = (msg: string) => z.number({ error: msg }).int().positive(msg);

const esquemaEntrada = z
  .object({
    bodega_id: id('Elige una bodega.'),
    producto_id: id('Elige un producto.'),
    cantidad: z
      .number({ error: 'Escribe una cantidad entera.' })
      .int('Debe ser un número entero.')
      .min(1, 'Debe ser al menos 1.')
      .max(CANTIDAD_MAXIMA, `No puede ser mayor que ${CANTIDAD_MAXIMA}.`),
    modo: z.enum(['existente', 'nuevo']),
    lote_id: z.number().optional(),
    codigo: z.string().trim().max(50, 'Máximo 50 caracteres.'),
    fecha_vencimiento: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.modo === 'existente') {
      if (!d.lote_id)
        ctx.addIssue({ code: 'custom', path: ['lote_id'], message: 'Elige un lote.' });
      return;
    }
    if (!d.codigo) {
      ctx.addIssue({ code: 'custom', path: ['codigo'], message: 'Escribe el código del lote.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_vencimiento)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fecha_vencimiento'],
        message: 'Indica la fecha de vencimiento.',
      });
    } else if (diasHastaVencer(d.fecha_vencimiento) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['fecha_vencimiento'],
        message: 'El lote ya está vencido: no se puede ingresar.',
      });
    }
  });

type DatosEntrada = z.infer<typeof esquemaEntrada>;

const aNumero = (v: unknown) => (v === '' || v === undefined ? undefined : Number(v));

/** Cuerpo de la API: `lote_id` o `lote`, nunca ambos. */
function cuerpo(d: DatosEntrada): EntradaInventario {
  const base = { bodega_id: d.bodega_id, producto_id: d.producto_id, cantidad: d.cantidad };
  return d.modo === 'existente' && d.lote_id
    ? { ...base, lote_id: d.lote_id }
    : { ...base, lote: { codigo: d.codigo, fecha_vencimiento: d.fecha_vencimiento } };
}

interface Props {
  bodegaId: number | undefined;
  productoId: number | undefined;
  onCerrar: () => void;
}

export function DialogoEntrada({ bodegaId, productoId, onCerrar }: Props) {
  const queryClient = useQueryClient();
  const bodegas = useBodegas();
  const productos = useProductos();
  const [errorServidor, setErrorServidor] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    formState: { errors },
  } = useForm<DatosEntrada>({
    resolver: zodResolver(esquemaEntrada),
    defaultValues: {
      ...(bodegaId ? { bodega_id: bodegaId } : {}),
      ...(productoId ? { producto_id: productoId } : {}),
      modo: 'existente',
      codigo: '',
      fecha_vencimiento: '',
    },
  });
  const modo = useWatch({ control, name: 'modo' });
  const productoElegido = useWatch({ control, name: 'producto_id' });
  const lotes = useLotesDeProducto(productoElegido || undefined);
  // Solo se ofrecen lotes vigentes: los vencidos no admiten entradas
  const lotesVigentes = lotes.data?.filter((l) => diasHastaVencer(l.fecha_vencimiento) > 0);

  const enviar = useAccionUnica(async (datos: DatosEntrada) => {
    setErrorServidor(null);
    try {
      const r = await registrarEntrada(cuerpo(datos));
      toast.success(
        `Entrada registrada: ${r.producto.codigo} lote ${r.lote.codigo} en ${r.bodega.codigo} queda en ${r.entrada.saldo_posterior}${r.entrada.lote_creado ? ' (lote nuevo)' : ''}.`,
      );
      void invalidarStock(queryClient);
      onCerrar();
    } catch (e) {
      const pendiente = manejarErrorDeFormulario(e, setError, {
        bodega_id: 'bodega_id',
        producto_id: 'producto_id',
        cantidad: 'cantidad',
        lote_id: 'lote_id',
        'lote.codigo': 'codigo',
        'lote.fecha_vencimiento': 'fecha_vencimiento',
      });
      if (pendiente) setErrorServidor(pendiente);
    }
  });

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      bloquearCierre={enviar.pendiente}
      titulo="Registrar entrada"
      ancho="lg"
    >
      <form
        noValidate
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => void handleSubmit((d) => enviar.ejecutar(d))(e)}
      >
        <Field label="Bodega" error={errors.bodega_id?.message}>
          <Select {...register('bodega_id', { setValueAs: aNumero })}>
            <option value="">Elige…</option>
            {bodegas.data?.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} · {b.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Producto" error={errors.producto_id?.message}>
          <Select
            {...register('producto_id', {
              setValueAs: aNumero,
              onChange: () => setValue('lote_id', undefined),
            })}
          >
            <option value="">Elige…</option>
            {productos.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} · {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cantidad" error={errors.cantidad?.message}>
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="tabular-nums"
            {...register('cantidad', { valueAsNumber: true })}
          />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium text-slate-700">Lote</legend>
          <div className="flex h-9 items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" value="existente" {...register('modo')} /> Existente
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" value="nuevo" {...register('modo')} /> Nuevo
            </label>
          </div>
        </fieldset>
        {modo === 'existente' ? (
          <Field
            label="Lote existente"
            className="sm:col-span-2"
            error={errors.lote_id?.message}
            ayuda="Si el lote no aparece, regístralo como nuevo con su código y fecha."
          >
            <Select disabled={!productoElegido} {...register('lote_id', { setValueAs: aNumero })}>
              <option value="">
                {productoElegido ? 'Elige un lote…' : 'Elige primero un producto'}
              </option>
              {lotesVigentes?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} (vence {formatearFecha(l.fecha_vencimiento)})
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Código del lote" error={errors.codigo?.message}>
              <Input maxLength={50} autoComplete="off" {...register('codigo')} />
            </Field>
            <Field label="Fecha de vencimiento" error={errors.fecha_vencimiento?.message}>
              <Input type="date" {...register('fecha_vencimiento')} />
            </Field>
          </>
        )}
        {errorServidor ? (
          <div className="sm:col-span-2">
            <ErrorBanner error={errorServidor} />
          </div>
        ) : null}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variante="secundario" onClick={onCerrar} disabled={enviar.pendiente}>
            Cancelar
          </Button>
          <Button type="submit" pending={enviar.pendiente}>
            Registrar entrada
          </Button>
        </div>
      </form>
    </Dialogo>
  );
}
