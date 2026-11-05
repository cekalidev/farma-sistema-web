import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { EXISTENCIAS } from '../../mocks/datos';
import { reiniciarDispensaciones } from '../../mocks/handlers/dispensaciones';
import { server } from '../../mocks/server';
import { api } from '../../mocks/utilidades';
import { renderConProveedores } from '../../test/render';
import PantallaDispensacion from '.';
import { TITULO_ERROR_RED } from './FlujoDispensacion';

beforeEach(() => reiniciarDispensaciones());

/** Captura las Idempotency-Key enviadas; `fallar(n)` decide si la petición n devuelve error de red. */
function espiarCrear(fallar: (n: number) => boolean = () => false) {
  const claves: (string | null)[] = [];
  server.use(
    http.post(api('/dispensaciones'), ({ request }) => {
      claves.push(request.headers.get('Idempotency-Key'));
      if (fallar(claves.length)) return HttpResponse.error();
      return undefined; // sigue al handler del mock
    }),
  );
  return claves;
}

async function hastaPrevisualizar(
  u: UserEvent,
  { documento = '9900000001', bodega = /Farmacia Central/ } = {},
) {
  const select = await screen.findByLabelText('Bodega que dispensa');
  await u.selectOptions(select, await screen.findByRole('option', { name: bodega }));
  await u.type(screen.getByLabelText('Número de documento'), `${documento}{Enter}`);
  await u.click(await screen.findByRole('button', { name: /Prescripción #/ }));
  await u.click(screen.getByRole('button', { name: 'Previsualizar' }));
  await screen.findByText('Asignación orientativa: se recalcula al confirmar.');
}

const filasLotes = (producto: string) =>
  within(screen.getByRole('table', { name: `Lotes de ${producto}` }))
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent);

describe('dispensación', () => {
  it('flujo completo: FEFO sin vencidos y resultado CONFIRMADA con lotes', async () => {
    const u = userEvent.setup();
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    expect(await screen.findByLabelText('Número de documento')).toHaveFocus();
    await hastaPrevisualizar(u, { bodega: /Farmacia Urgencias/ });

    expect(screen.getByText('Ana Sintética')).toBeInTheDocument();
    // Primero el lote que vence antes; luego el siguiente si no alcanza
    const amox = filasLotes('Amoxicilina 500 mg');
    expect(amox[0]).toMatch(/AMOX500-A.*vence en 10 días.*20/);
    expect(amox[1]).toMatch(/AMOX500-B.*1$/);
    expect(filasLotes('Acetaminofén 500 mg')).toEqual([expect.stringMatching(/^ACET500-B.*30$/)]);
    expect(screen.queryByText('ACET500-A')).not.toBeInTheDocument();

    const confirmar = screen.getByRole('button', { name: 'Confirmar dispensación' });
    expect(confirmar).toHaveFocus();
    await u.click(confirmar);
    expect(await screen.findByText(/Dispensación #\d+ confirmada/)).toBeInTheDocument();
    expect(filasLotes('Acetaminofén 500 mg')[0]).toMatch(/ACET500-B/);
    expect(screen.queryByText(/ya estaba registrada/)).not.toBeInTheDocument();

    // Nueva dispensación: limpia y deja el foco en la búsqueda
    await u.click(screen.getByRole('button', { name: 'Nueva dispensación' }));
    expect(screen.getByLabelText('Número de documento')).toHaveFocus();
    expect(screen.getByLabelText('Número de documento')).toHaveValue('');
    expect(screen.queryByText(/confirmada/)).not.toBeInTheDocument();
  });

  it('doble clic en Confirmar: una sola petición', async () => {
    const u = userEvent.setup();
    const claves = espiarCrear();
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await hastaPrevisualizar(u);
    const boton = screen.getByRole('button', { name: 'Confirmar dispensación' });
    act(() => {
      boton.click();
      boton.click();
    });
    expect(await screen.findByText(/Dispensación #\d+ confirmada/)).toBeInTheDocument();
    expect(claves).toHaveLength(1);
  });

  it('reintento tras error de red: misma Idempotency-Key', async () => {
    const u = userEvent.setup();
    const claves = espiarCrear((n) => n === 1);
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await hastaPrevisualizar(u);
    await u.click(screen.getByRole('button', { name: 'Confirmar dispensación' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(TITULO_ERROR_RED);
    await u.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Dispensación #\d+ confirmada/)).toBeInTheDocument();
    expect(claves).toHaveLength(2);
    expect(claves[0]).toBeTruthy();
    expect(claves[1]).toBe(claves[0]);
  });

  it('si cambian las cantidades tras un fallo, se envía una clave nueva', async () => {
    const u = userEvent.setup();
    const claves = espiarCrear((n) => n === 1);
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await hastaPrevisualizar(u);
    await u.click(screen.getByRole('button', { name: 'Confirmar dispensación' }));
    await screen.findByRole('alert');

    const cantidad = screen.getByLabelText('Cantidad a dispensar de Acetaminofén 500 mg');
    await u.clear(cantidad);
    await u.type(cantidad, '29');
    expect(screen.getByText('Los datos cambiaron: vuelve a previsualizar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar dispensación' })).toBeDisabled();
    await u.click(screen.getByRole('button', { name: 'Previsualizar' }));
    await u.click(await screen.findByRole('button', { name: 'Confirmar dispensación' }));
    expect(await screen.findByText(/Dispensación #\d+ confirmada/)).toBeInTheDocument();
    expect(claves).toHaveLength(2);
    expect(claves[1]).not.toBe(claves[0]);
  });

  it('STOCK_INSUFICIENTE al confirmar: mensaje claro y resalta el ítem', async () => {
    const u = userEvent.setup();
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await hastaPrevisualizar(u);
    // Otro puesto consumió el stock entre la previsualización y la confirmación
    for (const e of EXISTENCIAS) {
      if (e.bodega_id === 1 && e.producto_id === 1 && e.lote.codigo !== 'ACET500-A') e.cantidad = 5;
    }
    await u.click(screen.getByRole('button', { name: 'Confirmar dispensación' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Stock insuficiente: solicitado 30, disponible 10.');
    expect(alerta).toHaveTextContent('40 unidad(es) vencidas');
    const fila = screen.getByText('Revisa este ítem').closest('tr');
    expect(fila).toHaveTextContent('Acetaminofén 500 mg');
  });

  it('control especial: queda PENDIENTE_AUTORIZACION con el aviso', async () => {
    const u = userEvent.setup();
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await hastaPrevisualizar(u, { documento: '9900000003' });
    expect(screen.getAllByText('Control especial').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /Incluye medicamento de control especial: quedará PENDIENTE DE AUTORIZACIÓN/,
      ),
    ).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Confirmar dispensación' }));
    expect(
      await screen.findByText(/pendiente de autorización por un regente distinto/),
    ).toBeInTheDocument();
  });

  it('validación: al menos un ítem > 0 y no más del pendiente', async () => {
    const u = userEvent.setup();
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await u.selectOptions(
      await screen.findByLabelText('Bodega que dispensa'),
      await screen.findByRole('option', { name: /Farmacia Central/ }),
    );
    await u.type(screen.getByLabelText('Número de documento'), '9900000001{Enter}');
    await u.click(await screen.findByRole('button', { name: /Prescripción #/ }));
    const acet = screen.getByLabelText('Cantidad a dispensar de Acetaminofén 500 mg');
    await u.clear(acet);
    await u.type(acet, '31');
    await u.click(screen.getByRole('button', { name: 'Previsualizar' }));
    expect(await screen.findByText('Máximo 30 (pendiente).')).toBeInTheDocument();
    await u.clear(acet);
    await u.type(acet, '0');
    const amox = screen.getByLabelText('Cantidad a dispensar de Amoxicilina 500 mg');
    await u.clear(amox);
    await u.type(amox, '0{Enter}');
    expect(
      await screen.findByText('Indica al menos un ítem con cantidad mayor que 0.'),
    ).toBeInTheDocument();
  });

  it('paciente inexistente: mensaje claro', async () => {
    const u = userEvent.setup();
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await u.type(await screen.findByLabelText('Número de documento'), '123{Enter}');
    expect(await screen.findByText(/No se encontró ningún paciente/)).toBeInTheDocument();
  });

  it('el auxiliar no ve el panel de pendientes', async () => {
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await screen.findByRole('option', { name: /Farmacia Central/ });
    expect(
      screen.queryByRole('heading', { name: /Pendientes de autorización/ }),
    ).not.toBeInTheDocument();
  });

  it('recuerda la bodega en sessionStorage', async () => {
    sessionStorage.setItem('farma.dispensacion.bodega', '2');
    renderConProveedores(<PantallaDispensacion />, { rol: 'auxiliar_farmacia' });
    await screen.findByRole('option', { name: /Farmacia Urgencias/ });
    await waitFor(() => expect(screen.getByLabelText('Bodega que dispensa')).toHaveValue('2'));
  });
});
