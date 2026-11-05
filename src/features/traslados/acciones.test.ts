import { describe, expect, it } from 'vite-plus/test';
import type { Discrepancia, EstadoTraslado, Traslado, Usuario } from '../../api/tipos';
import { TRASLADOS, USUARIOS } from '../../mocks/datos';
import { accionesDisponibles, MOTIVO_APROBAR_PROPIO, MOTIVO_RESOLVER_PROPIO } from './acciones';

const usuario = (id: number): Usuario => {
  const u = USUARIOS.find((x) => x.id === id);
  if (!u) throw new Error('sin usuario');
  return u;
};
const auxiliar = usuario(1);
const regente = usuario(2);
const regente2 = usuario(3);
const auditor = usuario(5);

const base = TRASLADOS.find((t) => t.id === 1) as Traslado;

function traslado(estado: EstadoTraslado, extra: Partial<Traslado> = {}): Traslado {
  return { ...base, estado, ...extra };
}

const pendiente = { id: 1, estado: 'PENDIENTE' } as Discrepancia;
const nombres = (t: Traslado, u: Usuario) =>
  accionesDisponibles(t, u).acciones.map((a) => [a.accion, a.habilitada]);

describe('accionesDisponibles', () => {
  it('BORRADOR + creador → solicitar y anular', () => {
    expect(nombres(traslado('BORRADOR', { creado_por_id: auxiliar.id }), auxiliar)).toEqual([
      ['solicitar', true],
      ['anular', true],
    ]);
  });

  it('BORRADOR + otro auxiliar → solicitar y anular deshabilitados', () => {
    const r = accionesDisponibles(traslado('BORRADOR', { creado_por_id: 99 }), auxiliar);
    expect(r.acciones.every((a) => !a.habilitada && a.motivo)).toBe(true);
  });

  it('SOLICITADO + regente solicitante → aprobar deshabilitado con motivo de segregación', () => {
    const t = traslado('SOLICITADO', { creado_por_id: regente.id, solicitado_por_id: regente.id });
    const aprobar = accionesDisponibles(t, regente).acciones.find((a) => a.accion === 'aprobar');
    expect(aprobar).toMatchObject({ habilitada: false, motivo: MOTIVO_APROBAR_PROPIO });
  });

  it('SOLICITADO + otro regente → aprobar', () => {
    const t = traslado('SOLICITADO', { solicitado_por_id: regente.id });
    expect(nombres(t, regente2)).toEqual([
      ['aprobar', true],
      ['anular', true],
    ]);
  });

  it('SOLICITADO + auxiliar → no puede aprobar', () => {
    const t = traslado('SOLICITADO', {
      creado_por_id: auxiliar.id,
      solicitado_por_id: auxiliar.id,
    });
    expect(nombres(t, auxiliar)).toEqual([['anular', true]]);
  });

  it('APROBADO → despachar con confirmación', () => {
    const r = accionesDisponibles(traslado('APROBADO'), auxiliar);
    expect(r.acciones[0]).toMatchObject({ accion: 'despachar', habilitada: true, confirmar: true });
  });

  it('EN_TRANSITO → solo recibir', () => {
    expect(nombres(traslado('EN_TRANSITO'), regente)).toEqual([['recibir', true]]);
  });

  it.each(['RECIBIDO', 'RECIBIDO_PARCIAL', 'ANULADO'] as const)('%s → ninguna acción', (estado) => {
    const r = accionesDisponibles(traslado(estado), regente);
    expect(r.acciones).toEqual([]);
    expect(r.resolverDiscrepancias).toBeNull();
  });

  it('final con discrepancia pendiente → resolver solo para un regente distinto del solicitante', () => {
    const t = traslado('RECIBIDO_PARCIAL', {
      solicitado_por_id: regente.id,
      discrepancias: [pendiente],
    });
    expect(accionesDisponibles(t, regente2)).toEqual({
      acciones: [],
      resolverDiscrepancias: { habilitada: true },
    });
    expect(accionesDisponibles(t, regente).resolverDiscrepancias).toEqual({
      habilitada: false,
      motivo: MOTIVO_RESOLVER_PROPIO,
    });
    expect(accionesDisponibles(t, auxiliar).resolverDiscrepancias).toBeNull();
  });

  it.each(['BORRADOR', 'SOLICITADO', 'APROBADO', 'EN_TRANSITO', 'RECIBIDO_PARCIAL'] as const)(
    'auditor en %s → ninguna',
    (estado) => {
      const t = traslado(estado, { discrepancias: [pendiente] });
      expect(accionesDisponibles(t, auditor)).toEqual({
        acciones: [],
        resolverDiscrepancias: null,
      });
    },
  );

  it('sin usuario → ninguna', () => {
    expect(accionesDisponibles(traslado('BORRADOR'), null).acciones).toEqual([]);
  });
});
