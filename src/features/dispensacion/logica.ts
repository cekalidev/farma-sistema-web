// Lógica pura de la pantalla de dispensación (sin React)
import { z } from 'zod';
import type {
  Paciente,
  Prescripcion,
  PrescripcionItem,
  SolicitudDispensacion,
} from '../../api/tipos';
import { esApiError } from '../../api/client';
import { diasHastaVencer, formatearFecha, hoyISO } from '../../lib/fechas';
import { esPrescripcionVigente } from '../../api/endpoints/pacientes';

// ---------- Idempotency-Key ----------

/**
 * Gestor de la Idempotency-Key: una clave por intento, ligada al cuerpo serializado.
 * Mismo cuerpo → misma clave (reintento seguro). Cuerpo distinto → clave nueva.
 */
export function crearGestorClave(generar: () => string) {
  let actual: { clave: string; cuerpo: string } | null = null;
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

/** Edad en años o, si viene enmascarada (solo año), "Nac. AAAA". */
export function textoEdad(p: Paciente, hoy: Date = new Date()): string {
  const f = p.fecha_nacimiento;
  if (!f) return 'Sin fecha de nacimiento';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return `Nac. ${f}`;
  const [a, m, d] = f.split('-').map(Number) as [number, number, number];
  let edad = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--;
  return `${edad} años`;
}

export const nombreCompleto = (p: Paciente) => `${p.nombres} ${p.apellidos}`;
