// Lotes asignados por FEFO, agrupados por ítem (previsualización, resultado y autorización)
import type { LoteResumen, ProductoConControl } from '../../api/tipos';
import { Badge } from '../../components/ui/Badge';
import { formatearFecha } from '../../lib/fechas';
import { textoVence } from './logica';

interface ItemLotes {
  prescripcion_item_id: number;
  producto: ProductoConControl;
  cantidad: number;
}

interface DetalleLote {
  prescripcion_item_id: number;
  lote: LoteResumen;
  cantidad: number;
}

interface Props {
  items: ItemLotes[];
  detalles: DetalleLote[];
  /** Texto si un ítem no tiene lotes (p. ej. pendiente de autorización). */
  sinLotes?: string;
}

export function TablaLotes({ items, detalles, sinLotes = 'Sin lotes asignados.' }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const lotes = detalles.filter((d) => d.prescripcion_item_id === item.prescripcion_item_id);
        return (
          <div key={item.prescripcion_item_id}>
            <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
              {item.producto.nombre}
              <span className="text-slate-500">· {item.cantidad} und.</span>
              {item.producto.control_especial ? (
                <Badge tono="violeta">Control especial</Badge>
              ) : null}
            </p>
            {lotes.length === 0 ? (
              <p className="text-sm text-slate-500">{sinLotes}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <caption className="sr-only">Lotes de {item.producto.nombre}</caption>
                  <thead className="bg-slate-100 text-xs tracking-wide text-slate-600 uppercase">
                    <tr>
                      <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                        Lote
                      </th>
                      <th scope="col" className="px-3 py-1.5 text-left font-semibold">
                        Vencimiento
                      </th>
                      <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                        Cantidad
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lotes.map((d) => (
                      <tr key={d.lote.id}>
                        <td className="px-3 py-1 font-mono">{d.lote.codigo}</td>
                        <td className="px-3 py-1">
                          {formatearFecha(d.lote.fecha_vencimiento)}{' '}
                          <span className="text-slate-500">
                            ({textoVence(d.lote.fecha_vencimiento)})
                          </span>
                        </td>
                        <td className="px-3 py-1 text-right tabular-nums">{d.cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
