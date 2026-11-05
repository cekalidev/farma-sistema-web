// Lotes asignados por FEFO, agrupados por ítem (previsualización, resultado y autorización)
import type { LoteResumen, ProductoConControl } from '../../api/tipos';
import { Badge } from '../../components/ui/Badge';
import { CLASE_CONTENEDOR_TABLA, CLASE_TD, CLASE_TH, CLASE_THEAD } from '../../components/ui/Table';
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
    <div className="flex min-w-0 flex-col gap-3">
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
              <div className={CLASE_CONTENEDOR_TABLA}>
                <table className="min-w-full text-sm">
                  <caption className="sr-only">Lotes de {item.producto.nombre}</caption>
                  <thead className={CLASE_THEAD}>
                    <tr>
                      <th scope="col" className={`${CLASE_TH} text-left`}>
                        Lote
                      </th>
                      <th scope="col" className={`${CLASE_TH} text-left`}>
                        Vencimiento
                      </th>
                      <th scope="col" className={`${CLASE_TH} text-right`}>
                        Cantidad
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lotes.map((d) => (
                      <tr key={d.lote.id}>
                        <td className={`${CLASE_TD} font-mono whitespace-nowrap`}>
                          {d.lote.codigo}
                        </td>
                        <td className={CLASE_TD}>
                          {formatearFecha(d.lote.fecha_vencimiento)}{' '}
                          <span className="text-slate-500">
                            ({textoVence(d.lote.fecha_vencimiento)})
                          </span>
                        </td>
                        <td className={`${CLASE_TD} text-right tabular-nums`}>{d.cantidad}</td>
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
