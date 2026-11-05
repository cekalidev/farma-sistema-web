// Formulario para crear un traslado en BORRADOR
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type Path,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { catalogosKeys, listarProductos } from '../../api/endpoints/catalogos';
import { inventarioKeys, listarExistencias } from '../../api/endpoints/inventario';
import { crearTraslado, trasladosKeys } from '../../api/endpoints/traslados';
import { manejarErrorDeFormulario } from '../../api/errores';
import type { Bodega, Existencia, Producto } from '../../api/tipos';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useAccionUnica } from '../../components/ui/useAccionUnica';
import { estadoVencimiento, formatearFecha } from '../../lib/fechas';

const ITEMS_MAXIMO = 50;
/** Claves del 422 que el formulario pinta; el resto va al banner. */
const CAMPOS_VISIBLES =
  /^(bodega_origen_id|bodega_destino_id|observaciones|items\.\d+\.(producto_id|lote_id|cantidad))$/;

const esquemaItem = z.object({
  producto_id: z.string().min(1, 'Elige el producto.'),
  lote_id: z.string().min(1, 'Elige el lote.'),
  cantidad: z
    .number({ error: 'Escribe la cantidad.' })
    .int('Debe ser un número entero.')
    .min(1, 'Mínimo 1 unidad.'),
  /** Disponible del lote elegido en el origen (no se envía). */
  disponible: z.number().nullable(),
});

const esquema = z
  .object({
    bodega_origen_id: z.string().min(1, 'Elige la bodega de origen.'),
    bodega_destino_id: z.string().min(1, 'Elige la bodega de destino.'),
    observaciones: z.string().trim().max(500, 'Máximo 500 caracteres.'),
    items: z
      .array(esquemaItem)
      .min(1, 'Agrega al menos un ítem.')
      .max(ITEMS_MAXIMO, `Máximo ${ITEMS_MAXIMO} ítems.`),
  })
  .superRefine((v, ctx) => {
    if (v.bodega_origen_id && v.bodega_origen_id === v.bodega_destino_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['bodega_destino_id'],
        message: 'El destino debe ser distinto del origen.',
      });
    }
    const vistos = new Set<string>();
    v.items.forEach((it, i) => {
      if (it.lote_id && vistos.has(it.lote_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'lote_id'],
          message: 'Este lote ya está en otra fila.',
        });
      }
      vistos.add(it.lote_id);
      if (it.disponible !== null && it.cantidad > it.disponible) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'cantidad'],
          message: `Supera el disponible en el origen (${it.disponible}).`,
        });
      }
    });
  });

type Formulario = z.infer<typeof esquema>;

const filaVacia = (): Formulario['items'][number] => ({
  producto_id: '',
  lote_id: '',
  cantidad: 1,
  disponible: null,
});

/** Lotes que se pueden trasladar: con stock y no vencidos. */
function lotesUtiles(existencias: Existencia[]): Existencia[] {
  return existencias.filter(
    (e) => e.cantidad > 0 && !e.vencido && estadoVencimiento(e.fecha_vencimiento) !== 'vencido',
  );
}

interface PropsFila {
  indice: number;
  origenId: string;
  productos: Producto[];
  lotesOtrasFilas: Set<string>;
  control: Control<Formulario>;
  register: UseFormRegister<Formulario>;
  setValue: UseFormSetValue<Formulario>;
  errores: FieldErrors<Formulario>['items'];
  puedeQuitar: boolean;
  onQuitar: () => void;
}

function FilaItem({
  indice,
  origenId,
  productos,
  lotesOtrasFilas,
  control,
  register,
  setValue,
  errores,
  puedeQuitar,
  onQuitar,
}: PropsFila) {
  const [productoId, cantidad, disponible] = useWatch({
    control,
    name: [`items.${indice}.producto_id`, `items.${indice}.cantidad`, `items.${indice}.disponible`],
  });
  const filtros = {
    bodega_id: Number(origenId),
    producto_id: Number(productoId),
    por_pagina: 100,
  };
  const lotes = useQuery({
    queryKey: inventarioKeys.lista(filtros),
    queryFn: ({ signal }) => listarExistencias(filtros, signal),
    enabled: !!origenId && !!productoId,
    select: (r) => lotesUtiles(r.data),
  });
  const err = errores?.[indice];
  const excede = disponible !== null && Number.isFinite(cantidad) && cantidad > disponible;
  const n = indice + 1;

  const loteDeshabilitado = !origenId || !productoId || lotes.isPending;
  let ayudaLote: string | undefined;
  if (!origenId) ayudaLote = 'Elige primero la bodega de origen.';
  else if (!productoId) ayudaLote = 'Elige primero el producto.';
  else if (lotes.isSuccess && lotes.data.length === 0)
    ayudaLote = 'Sin lotes vigentes con stock en el origen.';

  return (
    <fieldset className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_1.4fr_8rem_auto] sm:items-start">
      <legend className="px-1 text-xs font-medium text-slate-500">Ítem {n}</legend>
      <Field
        label={
          <>
            Producto<span className="sr-only"> (ítem {n})</span>
          </>
        }
        error={err?.producto_id?.message}
      >
        <Select
          {...register(`items.${indice}.producto_id`, {
            onChange: () => {
              setValue(`items.${indice}.lote_id`, '');
              setValue(`items.${indice}.disponible`, null);
            },
          })}
        >
          <option value="">Selecciona…</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={
          <>
            Lote<span className="sr-only"> (ítem {n})</span>
          </>
        }
        // Deshabilitado no admite corrección: basta la ayuda que explica qué falta
        error={loteDeshabilitado ? undefined : err?.lote_id?.message}
        ayuda={ayudaLote}
      >
        <Select
          disabled={loteDeshabilitado}
          {...register(`items.${indice}.lote_id`, {
            onChange: (e: { target: { value: string } }) => {
              const elegido = lotes.data?.find((l) => String(l.lote_id) === e.target.value);
              setValue(`items.${indice}.disponible`, elegido ? elegido.cantidad : null);
            },
          })}
        >
          <option value="">{lotes.isFetching ? 'Cargando lotes…' : 'Selecciona…'}</option>
          {lotes.data?.map((l) => (
            <option
              key={l.lote_id}
              value={l.lote_id}
              disabled={lotesOtrasFilas.has(String(l.lote_id))}
            >
              {l.lote.codigo} · vence {formatearFecha(l.fecha_vencimiento)} · disp. {l.cantidad}
              {lotesOtrasFilas.has(String(l.lote_id)) ? ' (ya agregado)' : ''}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={
          <>
            Cantidad<span className="sr-only"> (ítem {n})</span>
          </>
        }
        error={err?.cantidad?.message}
        ayuda={disponible !== null && !excede ? `Disponible: ${disponible}` : undefined}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          {...(disponible !== null ? { max: disponible } : {})}
          {...register(`items.${indice}.cantidad`, { valueAsNumber: true })}
        />
      </Field>
      <div className="flex flex-col gap-1 sm:pt-6">
        <Button
          variante="fantasma"
          tamano="sm"
          disabled={!puedeQuitar}
          onClick={onQuitar}
          aria-label={`Quitar ítem ${n}`}
        >
          Quitar
        </Button>
      </div>
      {excede && !err?.cantidad ? (
        <p role="alert" className="text-xs font-medium text-aviso-800 sm:col-span-4">
          La cantidad ({cantidad}) supera el disponible del lote en el origen ({disponible}).
        </p>
      ) : null}
    </fieldset>
  );
}

interface Props {
  bodegas: Bodega[];
  onCancelar: () => void;
}

export function NuevoTraslado({ bodegas, onCancelar }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);

  const productos = useQuery({
    queryKey: catalogosKeys.productos({ por_pagina: 100 }),
    queryFn: ({ signal }) => listarProductos({ por_pagina: 100 }, signal),
    staleTime: 5 * 60_000,
    select: (r) => r.data.filter((p) => p.activo),
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    setError: setErrorCampo,
    formState: { errors },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: {
      bodega_origen_id: '',
      bodega_destino_id: '',
      observaciones: '',
      items: [filaVacia()],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const [origenId, destinoId, items] = useWatch({
    control,
    name: ['bodega_origen_id', 'bodega_destino_id', 'items'],
  });
  const mismaBodega = !!origenId && origenId === destinoId;

  const enviar = useAccionUnica(async (datos: Formulario) => {
    setError(null);
    try {
      const obs = datos.observaciones.trim();
      const t = await crearTraslado({
        bodega_origen_id: Number(datos.bodega_origen_id),
        bodega_destino_id: Number(datos.bodega_destino_id),
        ...(obs ? { observaciones: obs } : {}),
        items: datos.items.map((it) => ({
          producto_id: Number(it.producto_id),
          lote_id: Number(it.lote_id),
          cantidad: it.cantidad,
        })),
      });
      queryClient.setQueryData(trasladosKeys.detalle(t.id), t);
      void queryClient.invalidateQueries({ queryKey: [...trasladosKeys.todo, 'lista'] });
      toast.success(`Traslado #${t.id} creado en borrador.`);
      void navigate(`/traslados/${t.id}`);
    } catch (e) {
      const pendiente = manejarErrorDeFormulario(e, setErrorCampo, (c) =>
        CAMPOS_VISIBLES.test(c) ? (c as Path<Formulario>) : null,
      );
      if (pendiente) setError(pendiente);
    }
  });

  return (
    <form
      noValidate
      aria-labelledby="titulo-nuevo-traslado"
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-xs"
      onSubmit={(e) => void handleSubmit((d) => enviar.ejecutar(d))(e)}
    >
      <h2 id="titulo-nuevo-traslado" className="text-base font-semibold">
        Nuevo traslado
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bodega de origen" error={errors.bodega_origen_id?.message}>
          <Select
            {...register('bodega_origen_id', {
              onChange: () => {
                // Los lotes dependen del origen: se limpian
                getValues('items').forEach((_, i) => {
                  setValue(`items.${i}.lote_id`, '');
                  setValue(`items.${i}.disponible`, null);
                });
              },
            })}
          >
            <option value="">Selecciona…</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} · {b.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Bodega de destino"
          error={
            errors.bodega_destino_id?.message ??
            (mismaBodega ? 'El destino debe ser distinto del origen.' : undefined)
          }
        >
          <Select {...register('bodega_destino_id')}>
            <option value="">Selecciona…</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.codigo} · {b.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Observaciones (opcional)" error={errors.observaciones?.message}>
        <Textarea rows={2} maxLength={500} {...register('observaciones')} />
      </Field>

      {productos.error ? (
        <ErrorBanner error={productos.error} onReintentar={() => void productos.refetch()} />
      ) : null}
      {fields.map((f, i) => (
        <FilaItem
          key={f.id}
          indice={i}
          origenId={origenId}
          productos={productos.data ?? []}
          lotesOtrasFilas={
            new Set(
              items
                .filter((_, j) => j !== i)
                .map((it) => it.lote_id)
                .filter(Boolean),
            )
          }
          control={control}
          register={register}
          setValue={setValue}
          errores={errors.items}
          puedeQuitar={fields.length > 1}
          onQuitar={() => remove(i)}
        />
      ))}
      {errors.items?.root?.message || errors.items?.message ? (
        <p className="text-xs font-medium text-peligro-700">
          {errors.items.root?.message ?? errors.items.message}
        </p>
      ) : null}
      <div>
        <Button
          variante="secundario"
          tamano="sm"
          disabled={fields.length >= ITEMS_MAXIMO}
          onClick={() => append(filaVacia())}
        >
          Agregar ítem
        </Button>
      </div>

      {error ? <ErrorBanner error={error} /> : null}

      <div className="flex justify-end gap-2">
        <Button variante="secundario" onClick={onCancelar} disabled={enviar.pendiente}>
          Cancelar
        </Button>
        <Button type="submit" pending={enviar.pendiente}>
          Crear traslado
        </Button>
      </div>
    </form>
  );
}
