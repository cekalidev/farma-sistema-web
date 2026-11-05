// Contrato del mock de dispensaciones (fiel al backend)
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { establecerToken } from '../../api/client';
import {
  autorizarDispensacion,
  crearDispensacion,
  previsualizarDispensacion,
  rechazarDispensacion,
} from '../../api/endpoints/dispensaciones';
import { listarPrescripciones } from '../../api/endpoints/pacientes';
import { EXISTENCIAS } from '../../mocks/datos';
import { reiniciarDispensaciones } from '../../mocks/handlers/dispensaciones';
import { tokenMock } from '../../mocks/utilidades';

const SOLICITUD = {
  paciente_id: 1,
  prescripcion_id: 1,
  bodega_id: 2,
  items: [
    { prescripcion_item_id: 11, cantidad: 30 },
    { prescripcion_item_id: 12, cantidad: 21 },
  ],
};

const stock = (bodega: number, lote: string) =>
  EXISTENCIAS.find((e) => e.bodega_id === bodega && e.lote.codigo === lote)?.cantidad;

beforeEach(() => {
  reiniciarDispensaciones();
  establecerToken(tokenMock('auxiliar@farma.test'));
});

describe('mock de dispensaciones', () => {
  it('previsualizar: FEFO multi-lote y sin vencidos', async () => {
    const p = await previsualizarDispensacion(SOLICITUD);
    expect(p.detalles.map((d) => [d.lote.codigo, d.cantidad])).toEqual([
      ['ACET500-B', 30],
      ['AMOX500-A', 20],
      ['AMOX500-B', 1],
    ]);
    expect(stock(2, 'AMOX500-A')).toBe(20);
  });

  it('crear: descuenta, actualiza el pendiente y reproduce el reintento', async () => {
    const r1 = await crearDispensacion(SOLICITUD, 'clave-1');
    expect(r1.replayed).toBe(false);
    expect(r1.dispensacion.estado).toBe('CONFIRMADA');
    expect(stock(2, 'AMOX500-A')).toBe(0);
    expect(stock(2, 'AMOX500-B')).toBe(39);
    const [presc] = await listarPrescripciones(1);
    expect(presc?.items.map((i) => i.cantidad_pendiente)).toEqual([0, 0]);

    const r2 = await crearDispensacion(SOLICITUD, 'clave-1');
    expect(r2).toEqual({ dispensacion: r1.dispensacion, replayed: true });
    expect(stock(2, 'AMOX500-B')).toBe(39);

    await expect(
      crearDispensacion(
        { ...SOLICITUD, items: [{ prescripcion_item_id: 11, cantidad: 1 }] },
        'clave-1',
      ),
    ).rejects.toMatchObject({ status: 422, codigo: 'IDEMPOTENCY_KEY_REUTILIZADA' });
  });

  it('errores en el orden del backend; un 4xx no consume la clave', async () => {
    await expect(crearDispensacion(SOLICITUD, '')).rejects.toMatchObject({
      status: 400,
      codigo: 'IDEMPOTENCY_KEY_REQUERIDA',
    });
    await expect(crearDispensacion({ ...SOLICITUD, paciente_id: 2 }, 'k')).rejects.toMatchObject({
      codigo: 'PRESCRIPCION_NO_CORRESPONDE',
    });
    await expect(
      crearDispensacion({ ...SOLICITUD, items: [{ prescripcion_item_id: 11, cantidad: 31 }] }, 'k'),
    ).rejects.toMatchObject({
      codigo: 'CANTIDAD_EXCEDE_PRESCRITO',
      detalles: { prescripcion_item_id: 11, pendiente: 30, solicitado: 31 },
    });
    await expect(
      crearDispensacion({ ...SOLICITUD, items: [{ prescripcion_item_id: 11, cantidad: 0 }] }, 'k'),
    ).rejects.toMatchObject({
      codigo: 'VALIDACION',
      campos: { 'items.0.cantidad': expect.any(Array) },
    });
    // Tras corregir, la misma clave sirve
    const ok = await crearDispensacion(SOLICITUD, 'k');
    expect(ok.replayed).toBe(false);
  });

  it('stock insuficiente con solicitado, disponible y vencido', async () => {
    await expect(
      previsualizarDispensacion({
        ...SOLICITUD,
        bodega_id: 1,
        items: [{ prescripcion_item_id: 11, cantidad: 30 }],
      }),
    ).resolves.toBeDefined();
    for (const e of EXISTENCIAS)
      if (e.bodega_id === 1 && e.producto_id === 1 && e.lote.codigo !== 'ACET500-A') e.cantidad = 5;
    await expect(
      crearDispensacion(
        { ...SOLICITUD, bodega_id: 1, items: [{ prescripcion_item_id: 11, cantidad: 30 }] },
        'k',
      ),
    ).rejects.toMatchObject({
      status: 409,
      codigo: 'STOCK_INSUFICIENTE',
      detalles: {
        prescripcion_item_id: 11,
        solicitado: 30,
        disponible: 10,
        vencido_no_dispensable: 40,
        bodega_id: 1,
        producto_id: 1,
      },
    });
  });

  it('control especial: pendiente sin descontar; segregación al autorizar', async () => {
    establecerToken(tokenMock('regente@farma.test'));
    const { dispensacion: d } = await crearDispensacion(
      {
        paciente_id: 3,
        prescripcion_id: 3,
        bodega_id: 1,
        items: [{ prescripcion_item_id: 31, cantidad: 3 }],
      },
      'k',
    );
    expect(d.estado).toBe('PENDIENTE_AUTORIZACION');
    expect(d.detalles).toEqual([]);
    expect(stock(1, 'MORF10-A')).toBe(12);
    await expect(autorizarDispensacion(d.id)).rejects.toMatchObject({
      status: 403,
      codigo: 'AUTORIZACION_MISMO_USUARIO',
    });
    establecerToken(tokenMock('regente2@farma.test'));
    const a = await autorizarDispensacion(d.id);
    expect(a.estado).toBe('CONFIRMADA');
    expect(a.detalles.map((x) => [x.lote.codigo, x.cantidad])).toEqual([['MORF10-A', 3]]);
    expect(stock(1, 'MORF10-A')).toBe(9);
    await expect(rechazarDispensacion(d.id, 'Motivo suficientemente largo')).rejects.toMatchObject({
      status: 409,
      codigo: 'TRANSICION_INVALIDA',
    });
    establecerToken(tokenMock('auxiliar@farma.test'));
    await expect(autorizarDispensacion(1)).rejects.toMatchObject({
      status: 403,
      codigo: 'NO_AUTORIZADO',
    });
  });
});
