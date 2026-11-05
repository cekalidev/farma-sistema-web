// Lógica pura de la pantalla de dispensación (sin React)
import { z } from 'zod';
import type {
  Dispensacion,
  Paciente,
  Prescripcion,
  PrescripcionItem,
  SolicitudDispensacion,
  Usuario,
} from '../../api/tipos';
import { esApiError } from '../../api/client';
import { diasHastaVencer, formatearFecha, hoyISO } from '../../lib/fechas';
import { esPrescripcionVigente } from '../../api/endpoints/pacientes';

// ---------- Idempotency-Key ----------

/**
 * Gestor de la Idempotency-Key: una clave por intento, ligada al cuerpo serializado.
 * Mismo cuerpo → misma clave (reintento seguro). Cuerpo distinto → clave nueva.
 */
export function crearGestorClave(
  generar: () => string,
  inicial: { clave: string; cuerpo: string } | null = null,
) {
  let actual = inicial;
  return {
    claveParaCuerpo(cuerpo: string): string {
      if (actual?.cuerpo !== cuerpo) actual = { clave: generar(), cuerpo };
      return actual.clave;
    },
    /** Tras un éxito: el siguiente envío es otra dispensación. */
    olvidar(): void {
      actual = null;
    },
  };
}

export type GestorClave = ReturnType<typeof crearGestorClave>;

// ---------- Persistencia en sessionStorage (con try/catch: puede no haber almacenamiento) ----------

export const CLAVE_INTENTO = 'farma.dispensacion.intento';
export const CLAVE_PENDIENTES = 'farma.dispensacion.pendientes';

/** Envío con resultado incierto (red o 5xx): se guarda hasta resolverlo para no perder la clave. */
export interface IntentoPendiente {
  clave: string;
  firmaCuerpo: string;
  cuerpo: SolicitudDispensacion;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function leerIntento(): IntentoPendiente | null {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(CLAVE_INTENTO) ?? 'null');
    if (!esObjeto(v) || typeof v.clave !== 'string' || typeof v.firmaCuerpo !== 'string')
      return null;
    if (!esObjeto(v.cuerpo) || !Array.isArray(v.cuerpo.items)) return null;
    const cuerpo = v.cuerpo as unknown as SolicitudDispensacion;
    // Solo si el cuerpo guardado sigue siendo el firmado (misma clave ⇔ mismo cuerpo)
    return serializarSolicitud(cuerpo) === v.firmaCuerpo
      ? { clave: v.clave, firmaCuerpo: v.firmaCuerpo, cuerpo }
      : null;
  } catch {
    return null;
  }
}

export function guardarIntento(i: IntentoPendiente): void {
  try {
    sessionStorage.setItem(CLAVE_INTENTO, JSON.stringify(i));
  } catch {
    // Sin almacenamiento: la clave solo vive en memoria
  }
}

export function borrarIntento(): void {
  try {
    sessionStorage.removeItem(CLAVE_INTENTO);
  } catch {
    // Nada que borrar
  }
}

/** Ids de dispensaciones PENDIENTES creadas en esta sesión (accesos rápidos del panel). */
export function leerPendientesSesion(): number[] {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(CLAVE_PENDIENTES) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x > 0) : [];
  } catch {
    return [];
  }
}

export function guardarPendientesSesion(ids: number[]): void {
  try {
    if (ids.length) sessionStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(ids));
    else sessionStorage.removeItem(CLAVE_PENDIENTES);
  } catch {
    // Sin almacenamiento: solo no se recuerdan
  }
}

/** Serialización estable del cuerpo (mismo orden de claves que `cuerpo()` del endpoint). */
export function serializarSolicitud(s: SolicitudDispensacion): string {
  return JSON.stringify({
    paciente_id: s.paciente_id,
    prescripcion_id: s.prescripcion_id,
    bodega_id: s.bodega_id,
    items: s.items.map((i) => ({
      prescripcion_item_id: i.prescripcion_item_id,
      cantidad: i.cantidad,
    })),
  });
}

// ---------- Formulario de cantidades ----------

export interface ValoresItems {
  items: { prescripcion_item_id: number; cantidad: number }[];
}

export const pendienteDe = (i: PrescripcionItem): number =>
  i.cantidad_pendiente ?? i.cantidad_prescrita;

/** Esquema Zod: entero 0..pendiente por ítem y al menos uno mayor que 0. */
export function esquemaItems(items: PrescripcionItem[]) {
  const maximos = new Map(items.map((i) => [i.id, pendienteDe(i)]));
  return z
    .object({
      items: z.array(
        z
          .object({
            prescripcion_item_id: z.number(),
            cantidad: z
              .number({ error: 'Escribe una cantidad.' })
              .int('Debe ser un número entero.')
              .min(0, 'No puede ser negativa.'),
          })
          .superRefine((v, ctx) => {
            const max = maximos.get(v.prescripcion_item_id) ?? 0;
            if (v.cantidad > max) {
              ctx.addIssue({
                code: 'custom',
                path: ['cantidad'],
                message: `Máximo ${max} (pendiente).`,
              });
            }
          }),
      ),
    })
    .refine((v) => v.items.some((i) => i.cantidad > 0), {
      path: ['root'],
      message: 'Indica al menos un ítem con cantidad mayor que 0.',
    });
}

export function valoresIniciales(p: Prescripcion): ValoresItems {
  return {
    items: p.items.map((i) => ({ prescripcion_item_id: i.id, cantidad: pendienteDe(i) })),
  };
}

/** Cuerpo de la petición: solo ítems con cantidad > 0 (el backend exige min 1). */
export function construirSolicitud(
  paciente_id: number,
  prescripcion_id: number,
  bodega_id: number,
  valores: ValoresItems,
): SolicitudDispensacion {
  return {
    paciente_id,
    prescripcion_id,
    bodega_id,
    items: valores.items
      .filter((i) => i.cantidad > 0)
      .map((i) => ({ prescripcion_item_id: i.prescripcion_item_id, cantidad: i.cantidad })),
  };
}

/** `items.N.*` del backend (índice de la solicitud) → índice del formulario. */
export function mapaCamposServidor(
  solicitud: SolicitudDispensacion,
  valores: ValoresItems,
): Record<string, `items.${number}.cantidad`> {
  const mapa: Record<string, `items.${number}.cantidad`> = {};
  solicitud.items.forEach((it, i) => {
    const indice = valores.items.findIndex(
      (v) => v.prescripcion_item_id === it.prescripcion_item_id,
    );
    if (indice >= 0) {
      mapa[`items.${i}.cantidad`] = `items.${indice}.cantidad`;
      mapa[`items.${i}.prescripcion_item_id`] = `items.${indice}.cantidad`;
    }
  });
  return mapa;
}

// ---------- Errores ----------

const CODIGOS_CON_ITEM = new Set(['STOCK_INSUFICIENTE', 'CANTIDAD_EXCEDE_PRESCRITO']);

/** Ítem prescrito afectado por un error de negocio (para resaltarlo), o null. */
export function itemAfectado(e: unknown): number | null {
  if (!esApiError(e) || !CODIGOS_CON_ITEM.has(e.codigo)) return null;
  const id = e.detalles.prescripcion_item_id;
  return typeof id === 'number' ? id : null;
}

/**
 * `GET /dispensaciones` existe desde v0.13.0; para backends anteriores se mantiene la degradación:
 * 404/405 pasan a "Abrir dispensación #".
 */
export function listadoNoDisponible(e: unknown): boolean {
  return (
    esApiError(e) &&
    (e.status === 404 ||
      e.status === 405 ||
      e.codigo === 'NO_ENCONTRADO' ||
      e.codigo === 'METODO_NO_PERMITIDO')
  );
}

/** Errores tras los que el pendiente de la prescripción pudo cambiar: hay que refrescarla. */
export function refrescaPrescripcion(e: unknown): boolean {
  return (
    esApiError(e) &&
    (e.codigo === 'CANTIDAD_EXCEDE_PRESCRITO' || e.codigo === 'PRESCRIPCION_NO_VIGENTE')
  );
}

/** Nombre del producto de un STOCK_INSUFICIENTE, resuelto con los ítems ya cargados. */
export function productoDelError(e: unknown, items: Dispensacion['items']): string | null {
  if (!esApiError(e) || e.codigo !== 'STOCK_INSUFICIENTE') return null;
  const { producto_id: prod, prescripcion_item_id: presc } = e.detalles;
  const item =
    items.find((i) => typeof presc === 'number' && i.prescripcion_item_id === presc) ??
    items.find((i) => typeof prod === 'number' && i.producto_id === prod);
  return item ? item.producto.nombre : null;
}

/** "Tú", el nombre si la API lo trae o "Usuario #id" (como en Traslados). */
export function nombreUsuario(
  id: number,
  actual: Usuario | null | undefined,
  nombre?: string | null,
): string {
  if (actual?.id === id) return 'Tú';
  return nombre?.trim() ? nombre : `Usuario #${id}`;
}

// ---------- Textos ----------

/** Motivo por el que no se puede usar una prescripción, o null si está vigente. */
export function motivoNoVigente(p: Prescripcion, hoy: string = hoyISO()): string | null {
  if (esPrescripcionVigente(p, hoy)) return null;
  if (p.estado === 'ANULADA') return 'Anulada';
  return `Vencida el ${formatearFecha(p.fecha_vencimiento)}`;
}

export function textoVence(fecha: string, hoy: Date = new Date()): string {
  const dias = diasHastaVencer(fecha, hoy);
  if (dias <= 0) return 'vencido';
  if (dias === 1) return 'vence mañana';
  return `vence en ${dias} días`;
}

/** Edad en años o, si viene enmascarada (solo año o cualquier otro formato), "Nac. <valor>". */
export function textoEdad(p: Paciente, hoy: Date = new Date()): string {
  const f = p.fecha_nacimiento;
  if (!f) return 'Sin fecha de nacimiento';
  if (p.enmascarado || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return `Nac. ${f}`;
  const [a, m, d] = f.split('-').map(Number) as [number, number, number];
  let edad = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--;
  return `${edad} años`;
}

export const nombreCompleto = (p: Paciente) => `${p.nombres} ${p.apellidos}`;
