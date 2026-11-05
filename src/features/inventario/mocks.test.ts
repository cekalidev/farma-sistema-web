// Contrato del mock de inventario y alertas (§4.3, §4.8)
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { establecerToken, peticion } from '../../api/client';
import { listarAlertasStockMinimo, listarAlertasVencimiento } from '../../api/endpoints/alertas';
import { hoyISO } from '../../lib/fechas';
import { reiniciarInventario } from '../../mocks/handlers/inventario';
import { tokenMock } from '../../mocks/utilidades';

const error = (p: Promise<unknown>) => p.then(() => null).catch((e: unknown) => e);

beforeEach(() => {
  reiniciarInventario();
  establecerToken(tokenMock('regente@farma.test'));
});

describe('mock de inventario', () => {
  it('ajustes y entradas rechazan claves extra con 422 "Campo no permitido."', async () => {
    const casos: [string, unknown, string][] = [
      [
        '/inventario/ajustes',
        { existencia_id: 1, cantidad: 1, motivo: 'Conteo físico', x: 1 },
        'x',
      ],
      [
        '/inventario/entradas',
        { bodega_id: 1, producto_id: 1, cantidad: 1, lote_id: 2, proveedor: 'P' },
        'proveedor',
      ],
      [
        '/inventario/entradas',
        {
          bodega_id: 1,
          producto_id: 1,
          cantidad: 1,
          lote: { codigo: 'L-NUEVO', fecha_vencimiento: '2099-01-01', costo: 3 },
        },
        'lote.costo',
      ],
    ];
    for (const [ruta, body, campo] of casos) {
      const e = await error(peticion(ruta, { method: 'POST', body }));
      expect(e, campo).toMatchObject({
        status: 422,
        codigo: 'VALIDACION',
        campos: { [campo]: ['Campo no permitido.'] },
      });
    }
  });
});

describe('mock de alertas', () => {
  it('vencimientos paginados con meta.hoy y dias_alerta_vencimiento', async () => {
    const r = await listarAlertasVencimiento(1);
    expect(r.meta).toMatchObject({ hoy: hoyISO(), dias_alerta_vencimiento: 90, per_page: 100 });
    expect(r.links).toHaveProperty('next');
    const [primera] = r.data;
    expect(primera).toMatchObject({
      tipo: 'VENCIDO',
      lote: { codigo: 'ACET500-A' },
      fecha_vencimiento: primera?.lote.fecha_vencimiento,
    });
    const fechas = r.data.map((a) => a.fecha_vencimiento);
    expect(fechas).toEqual(fechas.toSorted());
  });

  it('stock mínimo con stock_minimo_id y faltante, ordenado por faltante', async () => {
    const r = await listarAlertasStockMinimo();
    expect(r.meta.hoy).toBe(hoyISO());
    for (const a of r.data) {
      expect(a.stock_minimo_id).toBeGreaterThan(0);
      expect(a.faltante).toBe(a.minimo - a.actual);
    }
    const faltantes = r.data.map((a) => a.faltante);
    expect(faltantes).toEqual(faltantes.toSorted((x, y) => y - x));
  });

  it('filtro mal formado → 422 VALIDACION', async () => {
    const e = await error(peticion('/alertas/vencimientos', { query: { tipo: 'OTRO' } }));
    expect(e).toMatchObject({ status: 422, campos: { tipo: expect.any(Array) } });
  });
});
