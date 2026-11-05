import { describe, expect, it } from 'vite-plus/test';
import { establecerToken } from '../../api/client';
import { alertasStockMinimo, alertasVencimiento } from '../../api/endpoints/alertas';
import { listarDispensaciones } from '../../api/endpoints/dispensaciones';
import { buscarPacientes, listarPrescripciones } from '../../api/endpoints/pacientes';
import { tokenMock } from '../utilidades';

describe('mocks de endpoints faltantes', () => {
  it('auditor ve el paciente enmascarado; admin recibe 403', async () => {
    establecerToken(tokenMock('auditor@farma.test'));
    const [p] = await buscarPacientes({ tipo_documento: 'CC', numero_documento: '9900000001' });
    expect(p).toMatchObject({
      numero_documento: '******0001',
      nombres: 'A***',
      telefono: '*******001',
      correo: 'a***@***',
      direccion: null,
      enmascarado: true,
    });
    expect(p?.fecha_nacimiento).toBe('1985');
    establecerToken(tokenMock('admin@farma.test'));
    await expect(buscarPacientes({ numero_documento: '9900000001' })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('prescripciones, alertas y pendientes', async () => {
    establecerToken(tokenMock('regente@farma.test'));
    const presc = await listarPrescripciones(1);
    expect(presc[0]?.items.map((i) => i.producto.codigo)).toEqual(['ACET500', 'AMOX500']);
    const venc = await alertasVencimiento(1);
    expect(venc[0]).toMatchObject({ tipo: 'VENCIDO', lote: { codigo: 'ACET500-A' } });
    const minimos = await alertasStockMinimo(1);
    expect(minimos).toContainEqual(
      expect.objectContaining({
        producto: expect.objectContaining({ codigo: 'ACET500' }),
        minimo: 200,
      }),
    );
    const pend = await listarDispensaciones({ estado: 'PENDIENTE_AUTORIZACION' });
    expect(pend.meta.total).toBe(1);
  });
});
