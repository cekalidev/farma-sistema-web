import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type { Rol } from '../../api/tipos';
import { reiniciarInventario } from '../../mocks/handlers/inventario';
import { server } from '../../mocks/server';
import { api, errorApi } from '../../mocks/utilidades';
import { fechaRelativa } from '../../lib/fechas';
import { renderConProveedores } from '../../test/render';
import PantallaInventario from './index';

beforeEach(() => reiniciarInventario());

function renderInventario(rol: Rol = 'regente_farmacia', ruta = '/inventario') {
  return renderConProveedores(<PantallaInventario />, { rol, ruta });
}

async function tabla() {
  return screen.findByRole('table', { name: 'Existencias de inventario' });
}

/** Fila de la tabla por lote y bodega (código). */
async function fila(lote: string, bodega = 'FC') {
  const t = await tabla();
  const filas = within(t)
    .getAllByRole('row')
    .filter((r) => r.textContent?.includes(lote) && r.textContent.startsWith(bodega));
  expect(filas).toHaveLength(1);
  return filas[0] as HTMLElement;
}

async function abrirAjuste(lote: string, bodega = 'FC') {
  const usuario = userEvent.setup();
  const f = await fila(lote, bodega);
  await usuario.click(within(f).getByRole('button', { name: /^Ajustar/ }));
  const dialogo = await screen.findByRole('dialog', { name: 'Ajustar inventario' });
  return { usuario, dialogo };
}

describe('Inventario', () => {
  it('marca ACET500-A como Vencido, ACET500-B como Por vencer y enlaza al kardex', async () => {
    renderInventario('auditor');
    const vencida = await fila('ACET500-A');
    expect(within(vencida).getByText('Vencido')).toBeInTheDocument();
    expect(vencida).toHaveTextContent(/vencido hace 20 días/);
    expect(within(await fila('ACET500-B')).getByText('Por vencer')).toBeInTheDocument();
    expect(within(await fila('IBU400-A')).getByText('OK')).toBeInTheDocument();
    expect(within(vencida).getByRole('link', { name: /Ver kardex/ })).toHaveAttribute(
      'href',
      '/kardex?producto_id=1&lote_id=1&bodega_id=1',
    );
  });

  it('el panel de alertas muestra vencimientos y stock mínimo', async () => {
    renderInventario('auditor');
    const vencidos = await screen.findByRole('region', { name: 'Lotes vencidos con stock' });
    expect(vencidos).toHaveTextContent('ACET500-A');
    expect(vencidos).toHaveTextContent('LOS50-A');
    const porVencer = screen.getByRole('region', { name: 'Por vencer (≤90 días)' });
    expect(porVencer).toHaveTextContent('ACET500-B');
    expect(porVencer).toHaveTextContent('vence en 25 días');
    const minimos = await screen.findByRole('region', { name: 'Bajo stock mínimo' });
    expect(minimos).toHaveTextContent('ACET500');
    expect(minimos).toHaveTextContent('140/200');
    expect(minimos).toHaveTextContent('14/20');
  });

  it('alertas con la forma paginada: usa meta.hoy y el umbral de meta', async () => {
    let query = '';
    server.use(
      http.get(api('/alertas/vencimientos'), ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({
          data: [
            {
              existencia_id: 99,
              bodega: { id: 1, codigo: 'FC', nombre: 'Farmacia Central' },
              producto: { id: 1, codigo: 'SINT01', nombre: 'Producto sintético' },
              lote: { id: 99, codigo: 'L-SINT-9', fecha_vencimiento: '2030-01-10' },
              fecha_vencimiento: '2030-01-10',
              cantidad: 7,
              tipo: 'POR_VENCER',
              dias_restantes: 9,
            },
          ],
          links: { first: null, last: null, prev: null, next: null },
          meta: {
            current_page: 1,
            from: 1,
            last_page: 1,
            links: [],
            path: '/api/v1/alertas/vencimientos',
            per_page: 100,
            to: 1,
            total: 1,
            hoy: '2030-01-01',
            dias_alerta_vencimiento: 30,
          },
        });
      }),
    );
    renderInventario('auditor');
    const porVencer = await screen.findByRole('region', { name: 'Por vencer (≤30 días)' });
    expect(porVencer).toHaveTextContent('L-SINT-9');
    expect(porVencer).toHaveTextContent('vence en 9 días');
    expect(screen.getByText(/al 01\/01\/2030 · próximos 30 días/)).toBeInTheDocument();
    expect(query).toContain('por_pagina=100');
  });

  it('alertas 404/405: aviso discreto en lugar de error', async () => {
    server.use(
      http.get(api('/alertas/vencimientos'), () => errorApi(404, 'NO_ENCONTRADO', 'No existe.')),
      http.get(api('/alertas/stock-minimo'), () =>
        errorApi(405, 'METODO_NO_PERMITIDO', 'No permitido.'),
      ),
    );
    renderInventario('auditor');
    expect(await screen.findByText('Alertas no disponibles en este servidor.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await tabla()).toBeInTheDocument();
  });

  it('si falla stock mínimo, el resto de la pantalla sigue funcionando', async () => {
    server.use(
      http.get(api('/alertas/stock-minimo'), () => errorApi(500, 'ERROR_INTERNO', 'Falla')),
    );
    renderInventario('auditor');
    expect(await screen.findByText('No se pudo cargar el stock mínimo')).toBeInTheDocument();
    expect(
      await screen.findByRole('region', { name: 'Lotes vencidos con stock' }),
    ).toBeInTheDocument();
    expect(await tabla()).toBeInTheDocument();
  });

  it('cambiar la bodega envía bodega_id a la API', async () => {
    const pedidas: URL[] = [];
    server.use(
      http.get(api('/inventario'), ({ request }) => {
        pedidas.push(new URL(request.url));
      }),
    );
    const usuario = userEvent.setup();
    renderInventario('auxiliar_farmacia');
    await tabla();
    const select = screen.getByLabelText('Bodega');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(4));
    await usuario.selectOptions(select, '2');
    await waitFor(() =>
      expect(pedidas.some((u) => u.searchParams.get('bodega_id') === '2')).toBe(true),
    );
    await waitFor(() =>
      within(screen.getByRole('table', { name: 'Existencias de inventario' }))
        .getAllByRole('row')
        .slice(1)
        .forEach((r) => expect(r).toHaveTextContent(/^FU/)),
    );
  });

  it('el regente ve "Ajustar"; el auxiliar y el auditor no', async () => {
    const { unmount } = renderInventario('regente_farmacia');
    await tabla();
    expect(screen.getAllByRole('button', { name: /^Ajustar/ }).length).toBeGreaterThan(0);
    unmount();

    for (const rol of ['auxiliar_farmacia', 'auditor'] as const) {
      const r = renderInventario(rol);
      await tabla();
      expect(screen.queryByRole('button', { name: /^Ajustar/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Registrar entrada' })).not.toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /Ver kardex/ }).length).toBeGreaterThan(0);
      r.unmount();
    }
  });

  it('Escape cierra el ajuste y el foco vuelve a "Ajustar"', async () => {
    renderInventario();
    const f = await fila('IBU400-A');
    const ajustar = within(f).getByRole('button', { name: /^Ajustar/ });
    const usuario = userEvent.setup();
    await usuario.click(ajustar);
    const dialogo = await screen.findByRole('dialog', { name: 'Ajustar inventario' });
    expect(within(dialogo).getByLabelText('Cantidad (con signo)')).toHaveFocus();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ajustar).toHaveFocus();
  });

  it('valida cantidad y motivo antes de enviar', async () => {
    renderInventario();
    const { usuario, dialogo } = await abrirAjuste('IBU400-A');
    await usuario.type(within(dialogo).getByLabelText('Cantidad (con signo)'), '0');
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'corto');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar ajuste' }));
    expect(await within(dialogo).findByText('La cantidad no puede ser 0.')).toBeInTheDocument();
    expect(within(dialogo).getByText('Escribe al menos 10 caracteres.')).toBeInTheDocument();
  });

  it('un ajuste que deja stock negativo muestra stock insuficiente', async () => {
    renderInventario();
    const { usuario, dialogo } = await abrirAjuste('ACET500-A');
    await usuario.type(within(dialogo).getByLabelText('Cantidad (con signo)'), '-50');
    expect(dialogo).toHaveTextContent('Saldo resultante: -10');
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Baja por conteo físico');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar ajuste' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Stock insuficiente en la existencia: solicitado 50, disponible 40.',
    );
  });

  it('doble clic en confirmar envía una sola petición y actualiza la tabla', async () => {
    const cuerpos: unknown[] = [];
    server.use(
      http.post(api('/inventario/ajustes'), async ({ request }) => {
        cuerpos.push(await request.clone().json());
        await delay(30);
      }),
    );
    renderInventario();
    const { usuario, dialogo } = await abrirAjuste('IBU400-A');
    await usuario.type(within(dialogo).getByLabelText('Cantidad (con signo)'), '-5');
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Unidades dañadas en estante');
    const confirmar = within(dialogo).getByRole('button', { name: 'Confirmar ajuste' });
    act(() => {
      confirmar.click();
      confirmar.click();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cuerpos).toEqual([
      { existencia_id: expect.any(Number), cantidad: -5, motivo: 'Unidades dañadas en estante' },
    ]);
    await waitFor(async () => expect(await fila('IBU400-A')).toHaveTextContent('95'));
  });

  describe('entradas (regente)', () => {
    async function abrirEntrada() {
      const usuario = userEvent.setup();
      renderInventario();
      await tabla();
      await usuario.click(screen.getByRole('button', { name: 'Registrar entrada' }));
      const dialogo = await screen.findByRole('dialog', { name: 'Registrar entrada' });
      // Espera los catálogos
      await waitFor(() =>
        expect(within(dialogo).getAllByRole('option', { name: /Farmacia Urgencias/ })).toHaveLength(
          1,
        ),
      );
      await waitFor(() =>
        expect(within(dialogo).getAllByRole('option', { name: /IBU400/ })).toHaveLength(1),
      );
      return { usuario, dialogo };
    }

    it('registra un lote nuevo con cantidades enteras', async () => {
      const cuerpos: unknown[] = [];
      server.use(
        http.post(api('/inventario/entradas'), async ({ request }) => {
          cuerpos.push(await request.clone().json());
        }),
      );
      const { usuario, dialogo } = await abrirEntrada();
      await usuario.selectOptions(within(dialogo).getByLabelText('Bodega'), '2');
      await usuario.selectOptions(within(dialogo).getByLabelText('Producto'), '3');
      await usuario.type(within(dialogo).getByLabelText('Cantidad'), '30');
      await usuario.click(within(dialogo).getByLabelText('Nuevo'));
      await usuario.type(within(dialogo).getByLabelText('Código del lote'), 'IBU400-Z');
      const fecha = fechaRelativa(200);
      fireEvent.change(within(dialogo).getByLabelText('Fecha de vencimiento'), {
        target: { value: fecha },
      });
      await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar entrada' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(cuerpos).toEqual([
        {
          bodega_id: 2,
          producto_id: 3,
          cantidad: 30,
          lote: { codigo: 'IBU400-Z', fecha_vencimiento: fecha },
        },
      ]);
    });

    it('un lote existente con otra fecha muestra LOTE_NO_COINCIDE', async () => {
      const { usuario, dialogo } = await abrirEntrada();
      await usuario.selectOptions(within(dialogo).getByLabelText('Bodega'), '1');
      await usuario.selectOptions(within(dialogo).getByLabelText('Producto'), '3');
      await usuario.type(within(dialogo).getByLabelText('Cantidad'), '5');
      await usuario.click(within(dialogo).getByLabelText('Nuevo'));
      await usuario.type(within(dialogo).getByLabelText('Código del lote'), 'IBU400-A');
      fireEvent.change(within(dialogo).getByLabelText('Fecha de vencimiento'), {
        target: { value: fechaRelativa(999) },
      });
      await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar entrada' }));
      expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
        'El lote IBU400-A ya existe con otra fecha de vencimiento',
      );
    });

    it('rechaza en el cliente un lote nuevo ya vencido, sin llamar a la API', async () => {
      let llamadas = 0;
      server.use(
        http.post(api('/inventario/entradas'), () => {
          llamadas++;
        }),
      );
      const { usuario, dialogo } = await abrirEntrada();
      await usuario.selectOptions(within(dialogo).getByLabelText('Bodega'), '1');
      await usuario.selectOptions(within(dialogo).getByLabelText('Producto'), '3');
      await usuario.type(within(dialogo).getByLabelText('Cantidad'), '5');
      await usuario.click(within(dialogo).getByLabelText('Nuevo'));
      await usuario.type(within(dialogo).getByLabelText('Código del lote'), 'IBU400-X');
      fireEvent.change(within(dialogo).getByLabelText('Fecha de vencimiento'), {
        target: { value: fechaRelativa(-1) },
      });
      await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar entrada' }));
      expect(
        await within(dialogo).findByText('El lote ya está vencido: no se puede ingresar.'),
      ).toBeInTheDocument();
      expect(llamadas).toBe(0);
    });
  });
});
