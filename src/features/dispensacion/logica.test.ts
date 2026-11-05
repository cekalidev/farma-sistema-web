import { describe, expect, it } from 'vite-plus/test';
import { ApiError } from '../../api/client';
import type { Paciente, Prescripcion } from '../../api/tipos';
import { PACIENTES, PRESCRIPCIONES } from '../../mocks/datos';
import { fechaRelativa } from '../../lib/fechas';
import {
  construirSolicitud,
  crearGestorClave,
  esquemaItems,
  itemAfectado,
  mapaCamposServidor,
  motivoNoVigente,
  serializarSolicitud,
  textoEdad,
  textoVence,
} from './logica';

const presc = PRESCRIPCIONES[0] as Prescripcion;

describe('gestor de Idempotency-Key', () => {
  it('reutiliza la clave con el mismo cuerpo y genera otra si cambia', () => {
    let n = 0;
    const g = crearGestorClave(() => `k${++n}`);
    const a = serializarSolicitud(
      construirSolicitud(1, 1, 1, { items: [{ prescripcion_item_id: 11, cantidad: 3 }] }),
    );
    const b = serializarSolicitud(
      construirSolicitud(1, 1, 1, { items: [{ prescripcion_item_id: 11, cantidad: 2 }] }),
    );
    expect(g.claveParaCuerpo(a)).toBe('k1');
    expect(g.claveParaCuerpo(a)).toBe('k1');
    expect(g.claveParaCuerpo(b)).toBe('k2');
    // Volver al cuerpo anterior es otro intento: clave nueva
    expect(g.claveParaCuerpo(a)).toBe('k3');
    g.olvidar();
    expect(g.claveParaCuerpo(a)).toBe('k4');
  });
});

describe('cantidades', () => {
  const esquema = esquemaItems(presc.items);
  it('entero entre 0 y el pendiente, al menos uno > 0', () => {
    expect(
      esquema.safeParse({
        items: [
          { prescripcion_item_id: 11, cantidad: 30 },
          { prescripcion_item_id: 12, cantidad: 0 },
        ],
      }).success,
    ).toBe(true);
    expect(esquema.safeParse({ items: [{ prescripcion_item_id: 11, cantidad: 31 }] }).success).toBe(
      false,
    );
    expect(
      esquema.safeParse({ items: [{ prescripcion_item_id: 11, cantidad: 1.5 }] }).success,
    ).toBe(false);
    expect(esquema.safeParse({ items: [{ prescripcion_item_id: 11, cantidad: -1 }] }).success).toBe(
      false,
    );
    expect(
      esquema.safeParse({ items: [{ prescripcion_item_id: 11, cantidad: Number.NaN }] }).success,
    ).toBe(false);
    const ninguno = esquema.safeParse({
      items: [
        { prescripcion_item_id: 11, cantidad: 0 },
        { prescripcion_item_id: 12, cantidad: 0 },
      ],
    });
    expect(ninguno.success).toBe(false);
    expect(ninguno.error?.issues[0]?.message).toBe(
      'Indica al menos un ítem con cantidad mayor que 0.',
    );
  });

  it('la solicitud omite los ítems en 0 y mapea los índices del backend al formulario', () => {
    const valores = {
      items: [
        { prescripcion_item_id: 11, cantidad: 0 },
        { prescripcion_item_id: 12, cantidad: 5 },
      ],
    };
    const s = construirSolicitud(1, 1, 2, valores);
    expect(s.items).toEqual([{ prescripcion_item_id: 12, cantidad: 5 }]);
    expect(mapaCamposServidor(s, valores)['items.0.cantidad']).toBe('items.1.cantidad');
  });
});

describe('textos y errores', () => {
  it('ítem afectado solo para STOCK_INSUFICIENTE y CANTIDAD_EXCEDE_PRESCRITO', () => {
    const stock = new ApiError({
      status: 409,
      codigo: 'STOCK_INSUFICIENTE',
      mensaje: '',
      detalles: { prescripcion_item_id: 12 },
    });
    const otro = new ApiError({
      status: 422,
      codigo: 'PRESCRIPCION_NO_VIGENTE',
      mensaje: '',
      detalles: { prescripcion_item_id: 12 },
    });
    expect(itemAfectado(stock)).toBe(12);
    expect(itemAfectado(otro)).toBeNull();
  });

  it('motivo de prescripción no vigente', () => {
    expect(motivoNoVigente(presc)).toBeNull();
    expect(motivoNoVigente({ ...presc, estado: 'ANULADA' })).toBe('Anulada');
    expect(motivoNoVigente({ ...presc, fecha_vencimiento: fechaRelativa(-1) })).toMatch(
      /^Vencida el \d{2}\/\d{2}\/\d{4}$/,
    );
  });

  it('vencimiento y edad', () => {
    expect(textoVence(fechaRelativa(10))).toBe('vence en 10 días');
    expect(textoVence(fechaRelativa(0))).toBe('vencido');
    const p = PACIENTES[0] as Paciente;
    expect(textoEdad(p, new Date(2026, 3, 11))).toBe('40 años');
    expect(textoEdad(p, new Date(2026, 3, 12))).toBe('41 años');
    expect(textoEdad({ ...p, fecha_nacimiento: '1985' })).toBe('Nac. 1985');
  });
});
