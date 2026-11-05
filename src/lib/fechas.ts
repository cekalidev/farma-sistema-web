// Utilidades de fechas (zona local, formato es-CO)

const DIA_MS = 86_400_000;

function aISO(d: Date): string {
  const a = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${dia}`;
}

/** Hoy en `Y-m-d` (hora local). */
export function hoyISO(): string {
  return aISO(new Date());
}

/** Fecha `Y-m-d` desplazada `dias` respecto a hoy. */
export function fechaRelativa(dias: number, base: Date = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
  return aISO(d);
}

function desdeISO(fecha: string): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Días desde hoy hasta `fecha` (negativo si ya pasó; 0 = vence hoy). */
export function diasHastaVencer(fecha: string, hoy: Date = new Date()): number {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((desdeISO(fecha).getTime() - base.getTime()) / DIA_MS);
}

const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const formatoFechaHora = new Intl.DateTimeFormat('es-CO', {
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

/** Timestamp ISO 8601 → fecha y hora locales. */
export function formatearFechaHora(marca: string | null | undefined): string {
  if (!marca) return '—';
  const d = new Date(marca);
  return Number.isNaN(d.getTime()) ? marca : formatoFechaHora.format(d);
}

/** Umbral de "por vencer" (días). */
export const DIAS_POR_VENCER = 90;

export type EstadoVencimiento = 'vencido' | 'por vencer' | 'vigente';

/** Vencido si vence hoy o antes (no dispensable). */
export function estadoVencimiento(fecha: string, hoy: Date = new Date()): EstadoVencimiento {
  const dias = diasHastaVencer(fecha, hoy);
  if (dias <= 0) return 'vencido';
  if (dias <= DIAS_POR_VENCER) return 'por vencer';
  return 'vigente';
}
