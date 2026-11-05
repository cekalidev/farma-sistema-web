// Resultado de POST /dispensaciones (confirmada o pendiente de autorización)
import type { Dispensacion } from '../../api/tipos';
import { Button } from '../../components/ui/Button';
import { TablaLotes } from './TablaLotes';

export interface ResultadoDispensacion {
  dispensacion: Dispensacion;
  replayed: boolean;
}

export function Resultado({
  dispensacion: d,
  replayed,
  onNueva,
}: ResultadoDispensacion & { onNueva: () => void }) {
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
