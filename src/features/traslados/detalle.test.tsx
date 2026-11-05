import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import type { Traslado } from '../../api/tipos';
import { MOVIMIENTOS, TRASLADOS } from '../../mocks/datos';
import { reiniciarTraslados } from '../../mocks/handlers/traslados';
import { server } from '../../mocks/server';
import { api } from '../../mocks/utilidades';
import { renderApp } from '../../test/render';

const traslado2 = () => TRASLADOS.find((t) => t.id === 2) as Traslado;

// Cuenta las peticiones POST por ruta
let posts: string[] = [];
const contar = ({ request }: { request: Request }) => {
  if (request.method === 'POST') posts.push(new URL(request.url).pathname);
};

beforeEach(() => {
  reiniciarTraslados();
  posts = [];
  server.events.on('request:start', contar);
});
afterEach(() => {
  server.events.removeListener('request:start', contar);
});

describe('detalle de traslado', () => {
  it('muestra cabecera, línea de tiempo con "Tú" y observaciones como texto', async () => {
    Object.assign(traslado2(), { observaciones: '<b>Urgente</b>' });
    renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados/2' });
    expect(await screen.findByRole('heading', { name: 'Traslado #2' })).toBeInTheDocument();
    expect(screen.getByText('Solicitado', { selector: 'span.rounded' })).toBeInTheDocument();
    const linea = screen.getByRole('list', { name: 'Línea de tiempo' });
    expect(within(linea).getAllByText(/· Tú/)).toHaveLength(2);
    expect(screen.getByText('<b>Urgente</b>')).toBeInTheDocument();
  });

  it('regente que solicitó: aprobar deshabilitado con el motivo de segregación', async () => {
    Object.assign(traslado2(), { creado_por_id: 2, solicitado_por_id: 2 });
    renderApp({ rol: 'regente_farmacia', ruta: '/traslados/2' });
    expect(await screen.findByRole('button', { name: 'Aprobar' })).toBeDisabled();
    expect(
      screen.getByText(/No puedes aprobar un traslado que tú solicitaste/),
    ).toBeInTheDocument();
  });

  it('doble clic al confirmar el despacho → una sola petición POST', async () => {
    Object.assign(traslado2(), {
      estado: 'APROBADO',
      aprobado_por_id: 2,
      aprobado_en: new Date().toISOString(),
    });
    const usuario = userEvent.setup();
    renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados/2' });
    await usuario.click(await screen.findByRole('button', { name: 'Despachar' }));
    const dialogo = screen.getByRole('dialog', { name: 'Despachar traslado #2' });
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, despachar' });
    act(() => {
      confirmar.click();
      confirmar.click();
    });
    expect(await screen.findByText('En tránsito')).toBeInTheDocument();
    expect(posts.filter((p) => p.endsWith('/traslados/2/despachar'))).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Recibir' })).toBeEnabled();
  });

  it('recepción parcial → RECIBIDO_PARCIAL con discrepancia; otro regente la resuelve', async () => {
    Object.assign(traslado2(), { estado: 'EN_TRANSITO' });
    const usuario = userEvent.setup();
    const app = renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados/2' });
    await usuario.click(await screen.findByRole('button', { name: 'Recibir' }));
    const campo = screen.getByLabelText('Cantidad recibida de Acetaminofén 500 mg (ACET500-C)');
    await usuario.clear(campo);
    await usuario.type(campo, '15');
    expect(
      screen.getByText(
        'Se registrará una discrepancia de 5 unidades pendiente de resolución por un regente.',
      ),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Recibir todo completo' }));
    expect(screen.queryByText(/Se registrará una discrepancia/)).not.toBeInTheDocument();
    await usuario.clear(campo);
    await usuario.type(campo, '15');
    await usuario.click(screen.getByRole('button', { name: 'Confirmar recepción' }));

    expect(await screen.findByText('Recibido parcial')).toBeInTheDocument();
    const seccion = screen.getByRole('region', { name: 'Discrepancias' });
    expect(within(seccion).getByText('Pendiente')).toBeInTheDocument();
    expect(within(seccion).getByText('Faltan 5 unidad(es)')).toBeInTheDocument();
    // El auxiliar no resuelve
    expect(within(seccion).queryByRole('button', { name: 'Resolver…' })).not.toBeInTheDocument();
    app.unmount();

    // Regente distinto del solicitante (el auxiliar solicitó)
    renderApp({ rol: 'regente_farmacia', ruta: '/traslados/2' });
    const region = await screen.findByRole('region', { name: 'Discrepancias' });
    await usuario.selectOptions(
      within(region).getByLabelText(/Tipo de resolución/),
      'REINTEGRO_ORIGEN',
    );
    expect(
      within(region).getByText(/vuelven al inventario de la bodega de origen/),
    ).toBeInTheDocument();
    await usuario.click(within(region).getByRole('button', { name: 'Resolver…' }));
    const dialogo = screen.getByRole('dialog', { name: /Resolver discrepancia/ });
    await usuario.type(
      within(dialogo).getByLabelText('Motivo'),
      'Faltante devuelto al origen por conteo',
    );
    await usuario.click(within(dialogo).getByRole('button', { name: 'Resolver' }));
    expect(await within(region).findByText('Resuelta')).toBeInTheDocument();
    expect(within(region).getByText(/Reintegro al origen por Tú/)).toBeInTheDocument();
  });

  it('409 TRANSICION_INVALIDA → mensaje claro y recarga del estado', async () => {
    const usuario = userEvent.setup();
    renderApp({ rol: 'regente_farmacia', ruta: '/traslados/2' });
    const aprobar = await screen.findByRole('button', { name: 'Aprobar' });
    // Otra persona lo anula mientras tanto
    Object.assign(traslado2(), {
      estado: 'ANULADO',
      anulado_por_id: 1,
      anulado_en: new Date().toISOString(),
      motivo_anulacion: 'Pedido duplicado por error',
    });
    await usuario.click(aprobar);
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Otra persona cambió el estado del traslado');
    expect(alerta).toHaveTextContent(
      'No se puede aprobar porque el documento está en estado anulado',
    );
    expect(await screen.findByText('Anulado', { selector: 'span.rounded' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Pedido duplicado por error')).toBeInTheDocument();
  });

  it('auditor ve el detalle sin ningún botón de acción', async () => {
    Object.assign(traslado2(), { estado: 'APROBADO' });
    renderApp({ rol: 'auditor', ruta: '/traslados/2' });
    expect(await screen.findByRole('heading', { name: 'Traslado #2' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Acciones del traslado' })).not.toBeInTheDocument();
    for (const nombre of ['Solicitar', 'Aprobar', 'Despachar', 'Recibir', 'Anular']) {
      expect(screen.queryByRole('button', { name: nombre })).not.toBeInTheDocument();
    }
  });

  it('anular pide motivo y deja el traslado anulado', async () => {
    const usuario = userEvent.setup();
    renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados/1' });
    await usuario.click(await screen.findByRole('button', { name: 'Anular' }));
    const dialogo = screen.getByRole('dialog', { name: 'Anular traslado #1' });
    await usuario.type(within(dialogo).getByLabelText('Motivo'), 'Ya no se necesita el traslado');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Anular traslado' }));
    expect(await screen.findByText('Anulado', { selector: 'span.rounded' })).toBeInTheDocument();
    expect(posts).toEqual(['/api/v1/traslados/1/anular']);
  });

  it('despachar deja la SALIDA_TRASLADO en el kardex simulado', async () => {
    Object.assign(traslado2(), { estado: 'APROBADO', aprobado_por_id: 2 });
    const usuario = userEvent.setup();
    renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados/2' });
    await usuario.click(await screen.findByRole('button', { name: 'Despachar' }));
    const dialogo = screen.getByRole('dialog', { name: 'Despachar traslado #2' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Sí, despachar' }));
    expect(
      await screen.findByText('En tránsito', { selector: 'span.rounded' }),
    ).toBeInTheDocument();
    const salidas = MOVIMIENTOS.filter((m) => m.tipo === 'SALIDA_TRASLADO');
    expect(salidas).toHaveLength(traslado2().items.length);
    expect(salidas[0]).toMatchObject({
      cantidad: -20,
      bodega_id: 1,
      documento: { tipo: 'traslado', id: 2 },
    });
  });

  it('con el diálogo de despacho abierto o enviándose, "Anular" queda deshabilitado', async () => {
    Object.assign(traslado2(), { estado: 'APROBADO', aprobado_por_id: 2 });
    server.use(
      http.post(api('/traslados/:id/despachar'), async () => {
        await delay('infinite');
      }),
    );
    const usuario = userEvent.setup();
    renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados/2' });
    const anular = await screen.findByRole('button', { name: 'Anular' });
    expect(anular).toBeEnabled();
    await usuario.click(screen.getByRole('button', { name: 'Despachar' }));
    expect(anular).toBeDisabled();
    const dialogo = screen.getByRole('dialog', { name: 'Despachar traslado #2' });
    const confirmar = within(dialogo).getByRole('button', { name: 'Sí, despachar' });
    await usuario.click(confirmar);
    await waitFor(() => expect(confirmar).toHaveAttribute('aria-disabled', 'true'));
    expect(anular).toBeDisabled();
  });

  it('con la recepción abierta o enviándose, las acciones quedan deshabilitadas', async () => {
    Object.assign(traslado2(), { estado: 'EN_TRANSITO' });
    server.use(
      http.post(api('/traslados/:id/recibir'), async () => {
        await delay('infinite');
      }),
    );
    const usuario = userEvent.setup();
    renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados/2' });
    const recibir = await screen.findByRole('button', { name: 'Recibir' });
    await usuario.click(recibir);
    expect(recibir).toBeDisabled();
    const confirmar = screen.getByRole('button', { name: 'Confirmar recepción' });
    await usuario.click(confirmar);
    await waitFor(() => expect(confirmar).toHaveAttribute('aria-disabled', 'true'));
    expect(recibir).toBeDisabled();
  });

  it('el motivo de un botón deshabilitado queda enlazado con aria-describedby', async () => {
    Object.assign(traslado2(), { creado_por_id: 2, solicitado_por_id: 2 });
    renderApp({ rol: 'regente_farmacia', ruta: '/traslados/2' });
    const aprobar = await screen.findByRole('button', { name: 'Aprobar' });
    expect(aprobar).toHaveAccessibleDescription(/No puedes aprobar un traslado que tú solicitaste/);
  });
});
