// Contrato del mock de traslados: kardex compartido, claves extra y bodegas activas
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { establecerToken, peticion } from '../../api/client';
import {
  aprobarTraslado,
  despacharTraslado,
  recibirTraslado,
  resolverDiscrepancia,
} from '../../api/endpoints/traslados';
import { BODEGAS, MOVIMIENTOS, TRASLADOS } from '../../mocks/datos';
import { reiniciarTraslados } from '../../mocks/handlers/traslados';
import { tokenMock } from '../../mocks/utilidades';

const ITEM = { producto_id: 1, lote_id: 2, cantidad: 5 };
const CREAR = { bodega_origen_id: 1, bodega_destino_id: 2, items: [ITEM] };

const comoAux = () => establecerToken(tokenMock('auxiliar@farma.test'));
const comoRegente = () => establecerToken(tokenMock('regente@farma.test'));

const error = (p: Promise<unknown>) => p.then(() => null).catch((e: unknown) => e);

beforeEach(() => {
  reiniciarTraslados();
  comoAux();
});

describe('mock de traslados', () => {
  it('despachar y recibir registran SALIDA_TRASLADO y ENTRADA_TRASLADO con documento', async () => {
    comoRegente();
    await aprobarTraslado(2);
    comoAux();
    const t = await despacharTraslado(2);
    const doc = { tipo: 'traslado', id: 2 };
    const salidas = MOVIMIENTOS.filter((m) => m.tipo === 'SALIDA_TRASLADO');
    expect(salidas).toHaveLength(t.items.length);
    for (const m of salidas) {
      expect(m).toMatchObject({ bodega_id: 1, documento: doc });
      expect(m.cantidad).toBeLessThan(0);
      expect(m.saldo_posterior).toBe(m.saldo_anterior + m.cantidad);
    }
    const [primero, segundo] = t.items;
    if (!primero || !segundo) throw new Error('Semilla sin dos ítems');
    await recibirTraslado(2, {
      items: [
        { traslado_item_id: primero.id, cantidad_recibida: primero.cantidad - 2 },
        { traslado_item_id: segundo.id, cantidad_recibida: 0 },
      ],
    });
    const entradas = MOVIMIENTOS.filter((m) => m.tipo === 'ENTRADA_TRASLADO');
    // Recibir 0 no crea movimiento (S-70)
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({
      bodega_id: 2,
      cantidad: primero.cantidad - 2,
      documento: doc,
    });
  });

  it('resolver: clave extra → 422; ENTREGA_DESTINO crea un AJUSTE enlazado', async () => {
    comoRegente();
    await aprobarTraslado(2);
    comoAux();
    const t = await despacharTraslado(2);
    await recibirTraslado(2, {
      items: t.items.map((it, i) => ({
        traslado_item_id: it.id,
        cantidad_recibida: i === 0 ? it.cantidad - 3 : it.cantidad,
      })),
    });
    const disc = TRASLADOS.find((x) => x.id === 2)?.discrepancias[0];
    if (!disc) throw new Error('Sin discrepancia');
    comoRegente();
    const extra = await error(
      peticion(`/discrepancias/${disc.id}/resolver`, {
        method: 'POST',
        body: { tipo: 'PERDIDA', motivo: 'Perdido en el camino', cantidad: 1 },
      }),
    );
    expect(extra).toMatchObject({
      status: 422,
      codigo: 'VALIDACION',
      campos: { cantidad: ['Campo no permitido.'] },
    });
    const r = await resolverDiscrepancia(disc.id, {
      tipo: 'ENTREGA_DESTINO',
      motivo: 'Llegaron en el siguiente envío',
    });
    const ajuste = MOVIMIENTOS.find((m) => m.id === r.movimiento_kardex_id);
    expect(ajuste).toMatchObject({
      tipo: 'AJUSTE',
      bodega_id: 2,
      cantidad: 3,
      documento: null,
      motivo: `Discrepancia ${disc.id} del traslado 2 (ENTREGA_DESTINO): Llegaron en el siguiente envío`,
    });
  });

  it('claves extra → 422 VALIDACION "Campo no permitido." en cada endpoint', async () => {
    const casos: [string, 'POST' | 'PUT', unknown, string][] = [
      ['/traslados', 'POST', { ...CREAR, nota: 'x' }, 'nota'],
      ['/traslados', 'POST', { ...CREAR, items: [{ ...ITEM, precio: 1 }] }, 'items.0.precio'],
      ['/traslados/1/items', 'PUT', { items: [ITEM], estado: 'APROBADO' }, 'estado'],
      ['/traslados/1/anular', 'POST', { motivo: 'Ya no se necesita', extra: 1 }, 'extra'],
      [
        '/traslados/2/recibir',
        'POST',
        { items: [{ traslado_item_id: 1, cantidad_recibida: 1, lote_id: 3 }] },
        'items.0.lote_id',
      ],
    ];
    for (const [ruta, method, body, campo] of casos) {
      const e = await error(peticion(ruta, { method, body }));
      expect(e, ruta).toMatchObject({
        status: 422,
        codigo: 'VALIDACION',
        campos: { [campo]: ['Campo no permitido.'] },
      });
    }
  });

  it('una bodega inactiva se rechaza al crear', async () => {
    const bodega = BODEGAS.find((b) => b.id === 2);
    if (!bodega) throw new Error('Sin bodega 2');
    bodega.activa = false;
    try {
      const e = await error(peticion('/traslados', { method: 'POST', body: CREAR }));
      expect(e).toMatchObject({ status: 422, campos: { bodega_destino_id: expect.any(Array) } });
    } finally {
      bodega.activa = true;
    }
  });
});
