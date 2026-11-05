// Utilidades de fechas. "Hoy" es siempre el día calendario en Bogotá (como el backend),
// sin importar la zona del navegador; las fechas `Y-m-d` se restan en UTC.

const DIA_MS = 86_400_000;
export const ZONA_HORARIA = 'America/Bogota';

// en-CA formatea como `AAAA-MM-DD`
const formatoDiaBogota = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día calendario en Bogotá (`Y-m-d`) del instante `d`. */
export function diaEnBogota(d: Date = new Date()): string {
  return formatoDiaBogota.format(d);
}

/** Instante `d` como marca de tiempo de Bogotá (UTC-5 fijo, sin horario de verano): `…T10:01:00-05:00`. */
export function marcaEnBogota(d: Date = new Date()): string {
  return `${new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 19)}-05:00`;
}

/** Hoy en `Y-m-d` (zona America/Bogota). */
export function hoyISO(): string {
  return diaEnBogota();
}

/** `Y-m-d` → milisegundos UTC de ese día a medianoche. */
function utcDeISO(fecha: string): number {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  return Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1);
}

const isoDeUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Fecha `Y-m-d` desplazada `dias` respecto al día (en Bogotá) de `base`. */
export function fechaRelativa(dias: number, base: Date = new Date()): string {
  return isoDeUtc(utcDeISO(diaEnBogota(base)) + dias * DIA_MS);
}

function desdeISO(fecha: string): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * Días desde hoy (Bogotá) hasta `fecha` (negativo si ya pasó; 0 = vence hoy).
 * `hoy` puede ser un instante (`Date`) o un día ya calculado (`Y-m-d`).
 */
export function diasHastaVencer(fecha: string, hoy: Date | string = new Date()): number {
  const base = typeof hoy === 'string' ? hoy : diaEnBogota(hoy);
  return Math.round((utcDeISO(fecha) - utcDeISO(base)) / DIA_MS);
}

/** Lote vencido (no dispensable) si `fecha_vencimiento <= hoy` en Bogotá. */
export function loteVencido(fechaVencimiento: string, hoy: Date | string = new Date()): boolean {
  return diasHastaVencer(fechaVencimiento, hoy) <= 0;
}

/** Prescripción vigente por fecha si `hoy <= fecha_vencimiento` en Bogotá. */
export function prescripcionVigentePorFecha(
  fechaVencimiento: string,
  hoy: Date | string = new Date(),
): boolean {
  return diasHastaVencer(fechaVencimiento, hoy) >= 0;
}

const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const formatoFechaHora = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `2026-11-05` → `05/11/2026`. */
export function formatearFecha(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? formatoFecha.format(desdeISO(fecha)) : fecha;
}

/** Timestamp ISO 8601 → fecha y hora en Bogotá. */
export function formatearFechaHora(marca: string | null | undefined): string {
  if (!marca) return '—';
  const d = new Date(marca);
  return Number.isNaN(d.getTime()) ? marca : formatoFechaHora.format(d);
}

/** Umbral de "por vencer" (días). */
export const DIAS_POR_VENCER = 90;

export type EstadoVencimiento = 'vencido' | 'por vencer' | 'vigente';

/** Vencido si vence hoy o antes (no dispensable). */
export function estadoVencimiento(
  fecha: string,
  hoy: Date | string = new Date(),
): EstadoVencimiento {
  const dias = diasHastaVencer(fecha, hoy);
  if (dias <= 0) return 'vencido';
  if (dias <= DIAS_POR_VENCER) return 'por vencer';
  return 'vigente';
}
