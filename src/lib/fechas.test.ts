import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  diasHastaVencer,
  estadoVencimiento,
  fechaRelativa,
  hoyISO,
  loteVencido,
  prescripcionVigentePorFecha,
} from './fechas';

// 20:00 del 5 de noviembre en Bogotá = 01:00 del 6 de noviembre en UTC
const NOCHE_BOGOTA = new Date('2026-11-06T01:00:00Z');

describe('fechas en zona America/Bogota con navegador en UTC', () => {
  const tzOriginal = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOCHE_BOGOTA);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (tzOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = tzOriginal;
  });

  it('hoy es el día de Bogotá, no el de UTC', () => {
    expect(new Date().getUTCDate()).toBe(6);
    expect(hoyISO()).toBe('2026-11-05');
    expect(fechaRelativa(0)).toBe('2026-11-05');
    expect(fechaRelativa(1)).toBe('2026-11-06');
    expect(fechaRelativa(-5)).toBe('2026-10-31');
  });

  it('un lote que vence hoy (Bogotá) está vencido; el de mañana no', () => {
    expect(diasHastaVencer('2026-11-05')).toBe(0);
    expect(loteVencido('2026-11-05')).toBe(true);
    expect(diasHastaVencer('2026-11-06')).toBe(1);
    expect(loteVencido('2026-11-06')).toBe(false);
    expect(estadoVencimiento('2026-11-06')).toBe('por vencer');
    expect(estadoVencimiento('2026-11-05')).toBe('vencido');
  });

  it('una prescripción que vence hoy sigue vigente; la de ayer no', () => {
    expect(prescripcionVigentePorFecha('2026-11-05')).toBe(true);
    expect(prescripcionVigentePorFecha('2026-11-04')).toBe(false);
  });

  it('acepta el día de hoy como texto y cruza cambios de mes', () => {
    expect(diasHastaVencer('2026-12-01', '2026-11-30')).toBe(1);
    expect(diasHastaVencer('2027-03-01', '2027-02-28')).toBe(1);
  });
});
