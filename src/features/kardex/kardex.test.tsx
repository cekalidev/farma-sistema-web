import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import type { MovimientoKardex } from '../../api/tipos';
import { fechaRelativa } from '../../lib/fechas';
import { server } from '../../mocks/server';
import { api, paginar } from '../../mocks/utilidades';
import { renderConProveedores } from '../../test/render';
import PantallaKardex from './index';

function renderKardex(ruta = '/kardex') {
  return renderConProveedores(<PantallaKardex />, { rol: 'auditor', ruta });
}

const tabla = () => screen.findByRole('table', { name: 'Movimientos del kardex' });

function movimiento(parcial: Partial<MovimientoKardex>): MovimientoKardex {
  return {
    id: 1,
    tipo: 'ENTRADA',
    existencia_id: 1,
    bodega_id: 1,
    producto_id: 1,
    lote_id: 2,
    bodega: { id: 1, codigo: 'FC', nombre: 'Farmacia Central' },
    producto: { id: 1, codigo: 'ACET500', nombre: 'Acetaminofén 500 mg' },
    lote: { id: 2, codigo: 'ACET500-B', fecha_vencimiento: '2027-01-01' },
    cantidad: 10,
    saldo_anterior: 0,
    saldo_posterior: 10,
    motivo: null,
    usuario_id: 2,
    usuario: { id: 2, nombre: 'Regente Demo' },
    documento: null,
    created_at: '2026-11-01T13:00:00Z',
    ...parcial,
  };
}

describe('Kardex', () => {
  it('muestra el signo, la etiqueta del tipo, el saldo y el documento', async () => {
    const filas = [
      movimiento({ id: 1 }),
      movimiento({
        id: 2,
        tipo: 'SALIDA_DISPENSACION',
        cantidad: -3,
        saldo_anterior: 10,
        saldo_posterior: 7,
        documento: { tipo: 'dispensacion', id: 14 },
      }),
      movimiento({
        id: 3,
        tipo: 'SALIDA_TRASLADO',
        cantidad: -2,
        saldo_anterior: 7,
        saldo_posterior: 5,
        documento: { tipo: 'traslado', id: 9 },
      }),
      movimiento({
        id: 4,
        tipo: 'AJUSTE',
        cantidad: -1,
        saldo_anterior: 5,
        saldo_posterior: 4,
        motivo: 'Unidad rota en conteo',
      }),
    ];
    server.use(
      http.get(api('/kardex'), ({ request }) => HttpResponse.json(paginar(filas, request))),
    );
    renderKardex();
    const [, entrada, salida, traslado, ajuste] = within(await tabla()).getAllByRole('row');
    expect(entrada).toHaveTextContent('Entrada');
    expect(within(entrada as HTMLElement).getByText('+10')).toHaveClass('text-emerald-700');
    expect(salida).toHaveTextContent('Salida por dispensación');
    expect(within(salida as HTMLElement).getByText('−3')).toHaveClass('text-red-700');
    expect(salida).toHaveTextContent('10→ a 7');
    expect(salida).toHaveTextContent('Dispensación #14');
    expect(traslado).toHaveTextContent('Salida por traslado');
    expect(
      within(traslado as HTMLElement).getByRole('link', { name: 'Traslado #9' }),
    ).toHaveAttribute('href', '/traslados/9');
    expect(ajuste).toHaveTextContent('Ajuste');
    expect(ajuste).toHaveTextContent('Unidad rota en conteo');
    // Solo lectura
    expect(screen.queryByRole('button', { name: /editar|eliminar|borrar/i })).toBeNull();
  });

  it('lee los filtros del enlace de Inventario y los envía a la API', async () => {
    const pedidas: URL[] = [];
    server.use(
      http.get(api('/kardex'), ({ request }) => {
        pedidas.push(new URL(request.url));
      }),
    );
    renderKardex('/kardex?producto_id=1&lote_id=1&bodega_id=1');
    const filas = within(await tabla())
      .getAllByRole('row')
      .slice(1);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveTextContent('ACET500-A');
    expect(filas[0]).toHaveTextContent('+40');
    const q = pedidas.at(-1)?.searchParams;
    expect(q?.get('producto_id')).toBe('1');
    expect(q?.get('lote_id')).toBe('1');
    expect(q?.get('bodega_id')).toBe('1');
  });

  it('filtra por fechas y rechaza hasta < desde sin llamar a la API', async () => {
    const pedidas: URL[] = [];
    server.use(
      http.get(api('/kardex'), ({ request }) => {
        pedidas.push(new URL(request.url));
      }),
    );
    renderKardex();
    await tabla();

    // Rango sin movimientos: la semilla está en las últimas dos semanas
    const desde = fechaRelativa(-400);
    const hasta = fechaRelativa(-300);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: desde } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: hasta } });
    await waitFor(() => {
      const q = pedidas.at(-1)?.searchParams;
      expect(q?.get('desde')).toBe(desde);
      expect(q?.get('hasta')).toBe(hasta);
    });
    await screen.findByText('Sin movimientos');

    const antes = pedidas.length;
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: fechaRelativa(-500) } });
    expect(
      await screen.findByText('La fecha final no puede ser anterior a la inicial.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
    // Margen para una petición que no debe ocurrir
    await new Promise((r) => setTimeout(r, 50));
    expect(pedidas).toHaveLength(antes);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
