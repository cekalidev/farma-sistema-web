// Máquina de estados de la UI: qué acciones ve cada usuario en un traslado (RN-07, RN-08)
import type { Traslado, Usuario } from '../../api/tipos';
import { puede } from '../../auth/permisos';

export type AccionTraslado = 'solicitar' | 'aprobar' | 'despachar' | 'recibir' | 'anular';

export interface AccionVisible {
  accion: AccionTraslado;
  etiqueta: string;
  /** false: se muestra deshabilitada con `motivo`. */
  habilitada: boolean;
  motivo?: string;
  /** Pide confirmación antes de ejecutar (mueve stock). */
  confirmar?: boolean;
}

export interface PermisoDiscrepancias {
  habilitada: boolean;
  motivo?: string;
}

export interface AccionesTraslado {
  acciones: AccionVisible[];
  /** null: no hay discrepancias pendientes o el usuario no puede resolverlas. */
  resolverDiscrepancias: PermisoDiscrepancias | null;
}

export const ETIQUETA_ACCION: Record<AccionTraslado, string> = {
  solicitar: 'Solicitar',
  aprobar: 'Aprobar',
  despachar: 'Despachar',
  recibir: 'Recibir',
  anular: 'Anular',
};

export const MOTIVO_APROBAR_PROPIO = 'No puedes aprobar un traslado que tú solicitaste.';
export const MOTIVO_RESOLVER_PROPIO =
  'No puedes resolver discrepancias de un traslado que tú solicitaste. Debe hacerlo otro regente.';
export const MOTIVO_SOLICITAR_AJENO = 'Solo quien creó el traslado puede solicitarlo.';
export const MOTIVO_ANULAR_AJENO = 'Solo quien creó el traslado o un regente puede anularlo.';

const visible = (accion: AccionTraslado, extra: Partial<AccionVisible> = {}): AccionVisible => ({
  accion,
  etiqueta: ETIQUETA_ACCION[accion],
  habilitada: true,
  ...extra,
});

const bloqueada = (accion: AccionTraslado, motivo: string): AccionVisible =>
  visible(accion, { habilitada: false, motivo });

function accionAnular(t: Traslado, u: Usuario): AccionVisible | null {
  if (!puede(u, 'traslado.anular')) return null;
  if (t.creado_por_id === u.id || puede(u, 'traslado.aprobar')) return visible('anular');
  return bloqueada('anular', MOTIVO_ANULAR_AJENO);
}

/** Función pura: acciones de la barra según estado, permisos y segregación de funciones. */
export function accionesDisponibles(t: Traslado, u: Usuario | null | undefined): AccionesTraslado {
  const vacio: AccionesTraslado = { acciones: [], resolverDiscrepancias: null };
  if (!u) return vacio;

  const opera = puede(u, 'traslado.operar');
  const aprueba = puede(u, 'traslado.aprobar');
  const acciones: (AccionVisible | null)[] = [];

  switch (t.estado) {
    case 'BORRADOR':
      if (opera) {
        acciones.push(
          t.creado_por_id === u.id
            ? visible('solicitar')
            : bloqueada('solicitar', MOTIVO_SOLICITAR_AJENO),
        );
      }
      acciones.push(accionAnular(t, u));
      break;
    case 'SOLICITADO':
      if (aprueba) {
        acciones.push(
          t.solicitado_por_id === u.id
            ? bloqueada('aprobar', MOTIVO_APROBAR_PROPIO)
            : visible('aprobar'),
        );
      }
      acciones.push(accionAnular(t, u));
      break;
    case 'APROBADO':
      if (opera) acciones.push(visible('despachar', { confirmar: true }));
      acciones.push(accionAnular(t, u));
      break;
    case 'EN_TRANSITO':
      if (opera) acciones.push(visible('recibir'));
      break;
    default:
      // RECIBIDO, RECIBIDO_PARCIAL y ANULADO son finales
      break;
  }

  let resolverDiscrepancias: PermisoDiscrepancias | null = null;
  if (aprueba && t.discrepancias.some((d) => d.estado === 'PENDIENTE')) {
    resolverDiscrepancias =
      t.solicitado_por_id === u.id
        ? { habilitada: false, motivo: MOTIVO_RESOLVER_PROPIO }
        : { habilitada: true };
  }

  return {
    acciones: acciones.filter((a): a is AccionVisible => a !== null),
    resolverDiscrepancias,
  };
}
