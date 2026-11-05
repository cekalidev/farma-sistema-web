// Discrepancias del traslado y su resolución (regente distinto del solicitante)
import { useState } from 'react';
import type { Discrepancia, TipoResolucion, Traslado, Usuario } from '../../api/tipos';
import { EstadoBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { DialogoMotivo, MOTIVO_MAX_DISCREPANCIA } from '../../components/ui/DialogoMotivo';
import { Field, Select } from '../../components/ui/Field';
import { formatearFechaHora } from '../../lib/fechas';
import type { PermisoDiscrepancias } from './acciones';
import { quien, textoTipoResolucion, TIPOS_RESOLUCION } from './comun';

interface Props {
  traslado: Traslado;
  usuario: Usuario | null;
  permiso: PermisoDiscrepancias | null;
  onResolver: (d: Discrepancia, tipo: TipoResolucion, motivo: string) => Promise<unknown>;
}

function FilaPendiente({ d, onResolver }: { d: Discrepancia; onResolver: Props['onResolver'] }) {
  const [tipo, setTipo] = useState<TipoResolucion | ''>('');
  const [abierto, setAbierto] = useState(false);
  const elegido = TIPOS_RESOLUCION.find((t) => t.valor === tipo);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field
        label={`Tipo de resolución (discrepancia #${d.id})`}
        ayuda={elegido?.ayuda ?? 'Elige cómo se resuelve el faltante.'}
        className="w-full max-w-72"
      >
        <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoResolucion | '')}>
          <option value="">Selecciona…</option>
          {TIPOS_RESOLUCION.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
        </Select>
      </Field>
      <Button tamano="sm" className="mb-5" disabled={!elegido} onClick={() => setAbierto(true)}>
        Resolver…
      </Button>
      {elegido ? (
        <DialogoMotivo
          abierto={abierto}
          titulo={`Resolver discrepancia #${d.id}: ${elegido.texto}`}
          descripcion={`${d.cantidad} unidad(es). ${elegido.ayuda}`}
          etiquetaConfirmar="Resolver"
          variante="primario"
          maximo={MOTIVO_MAX_DISCREPANCIA}
          onConfirmar={(motivo) => onResolver(d, elegido.valor, motivo)}
          onCerrar={() => setAbierto(false)}
        />
      ) : null}
    </div>
  );
}

export function Discrepancias({ traslado, usuario, permiso, onResolver }: Props) {
  if (traslado.discrepancias.length === 0) return null;
  const item = (d: Discrepancia) => traslado.items.find((it) => it.id === d.traslado_item_id);
  return (
    <section aria-labelledby="titulo-discrepancias" className="flex flex-col gap-2">
      <h2 id="titulo-discrepancias" className="text-base font-semibold">
        Discrepancias
      </h2>
      {permiso && !permiso.habilitada ? (
        <p className="text-sm text-slate-600">{permiso.motivo}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {traslado.discrepancias.map((d) => {
          const it = item(d);
          return (
            <li key={d.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">#{d.id}</span>
                <EstadoBadge estado={d.estado} />
                <span>
                  {it ? (
                    <>
                      {it.producto.nombre} · lote{' '}
                      <span className="font-mono whitespace-nowrap">{it.lote.codigo}</span>
                    </>
                  ) : (
                    `Ítem #${d.traslado_item_id}`
                  )}
                </span>
                <span className="tabular-nums">Faltan {d.cantidad} unidad(es)</span>
              </div>
              {d.estado === 'RESUELTA' ? (
                <p className="mt-1 text-slate-700">
                  {textoTipoResolucion(d.tipo_resolucion)} por {quien(d.resuelto_por_id, usuario)}{' '}
                  el {formatearFechaHora(d.resuelto_en)}
                  {d.motivo ? <> · Motivo: {d.motivo}</> : null}
                </p>
              ) : permiso?.habilitada ? (
                <div className="mt-2">
                  <FilaPendiente d={d} onResolver={onResolver} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
