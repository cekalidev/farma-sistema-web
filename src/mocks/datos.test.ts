import { describe, expect, it } from 'vite-plus/test';
import {
  DISPENSACIONES,
  EXISTENCIAS,
  LOTES,
  MOVIMIENTOS,
  reiniciarDatos,
  TRASLADOS,
} from './datos';
import { registrarMovimiento } from './utilidades';

describe('reiniciarDatos', () => {
  it('reconstruye in-place los arrays mutables desde la semilla', () => {
    const refExistencias = EXISTENCIAS;
    const total = MOVIMIENTOS.length;
    const e = EXISTENCIAS[0];
    if (!e) throw new Error('sin existencias');
    const cantidad = e.cantidad;
    e.cantidad -= 5;
    registrarMovimiento({ tipo: 'SALIDA_DISPENSACION', existencia: e, cantidad: -5, usuarioId: 1 });
    expect(MOVIMIENTOS.at(-1)).toMatchObject({
      saldo_anterior: cantidad,
      saldo_posterior: cantidad - 5,
      usuario: { nombre: 'Auxiliar Demo' },
    });
    LOTES.push({ ...LOTES[0]!, id: 999 });
    TRASLADOS.length = 0;
    DISPENSACIONES.length = 0;

    reiniciarDatos();

    expect(EXISTENCIAS).toBe(refExistencias);
    expect(EXISTENCIAS[0]?.cantidad).toBe(cantidad);
    expect(MOVIMIENTOS).toHaveLength(total);
    expect(LOTES.some((l) => l.id === 999)).toBe(false);
    expect(TRASLADOS.length).toBeGreaterThan(0);
    expect(DISPENSACIONES.length).toBeGreaterThan(0);
  });
});
