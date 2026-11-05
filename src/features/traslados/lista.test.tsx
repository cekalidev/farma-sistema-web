import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { reiniciarTraslados } from '../../mocks/handlers/traslados';
import { renderApp } from '../../test/render';

beforeEach(() => reiniciarTraslados());

describe('lista de traslados', () => {
  it('muestra los traslados ordenados y filtra por estado desde la URL', async () => {
    const usuario = userEvent.setup();
    const { router } = renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados' });
    const tabla = await screen.findByRole('table', { name: 'Traslados' });
    const enlaces = within(tabla)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(enlaces).toEqual(['Traslado #2', 'Traslado #1']);
    expect(within(tabla).getByRole('link', { name: 'Traslado #2' })).toHaveAttribute(
      'href',
      '/traslados/2',
    );

    await usuario.selectOptions(screen.getByLabelText('Estado'), 'BORRADOR');
    await waitFor(() => expect(router.state.location.search).toBe('?estado=BORRADOR'));
    await waitFor(() =>
      expect(
        within(screen.getByRole('table', { name: 'Traslados' }))
          .getAllByRole('link')
          .map((a) => a.textContent),
      ).toEqual(['Traslado #1']),
    );
  });

  it('auditor ve la lista pero no el botón de nuevo traslado', async () => {
    renderApp({ rol: 'auditor', ruta: '/traslados' });
    expect(await screen.findByRole('table', { name: 'Traslados' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo traslado' })).not.toBeInTheDocument();
  });
});

describe('crear traslado', () => {
  async function abrirFormulario() {
    const usuario = userEvent.setup();
    const app = renderApp({ rol: 'auxiliar_farmacia', ruta: '/traslados' });
    await usuario.click(await screen.findByRole('button', { name: 'Nuevo traslado' }));
    const origen = await screen.findByLabelText('Bodega de origen');
    return { usuario, origen, router: app.router };
  }

  it('origen igual a destino da error de validación y no envía', async () => {
    const { usuario, origen } = await abrirFormulario();
    await usuario.selectOptions(origen, '1');
    await usuario.selectOptions(screen.getByLabelText('Bodega de destino'), '1');
    await usuario.click(screen.getByRole('button', { name: 'Crear traslado' }));
    expect(await screen.findByText('El destino debe ser distinto del origen.')).toBeInTheDocument();
    expect(screen.getByLabelText('Bodega de destino')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Elige el producto.')).toBeInTheDocument();
  });

  it('lotes vigentes con disponible, aviso si se supera y envío correcto navega al detalle', async () => {
    const { usuario, origen, router } = await abrirFormulario();
    await usuario.selectOptions(origen, '1');
    await usuario.selectOptions(screen.getByLabelText('Bodega de destino'), '2');
    await usuario.selectOptions(screen.getByLabelText('Producto (ítem 1)'), '1');

    // ACET500-A está vencido: no se ofrece
    const loteB = await screen.findByRole('option', { name: /ACET500-B · vence .* · disp\. 60/ });
    expect(screen.queryByRole('option', { name: /ACET500-A/ })).not.toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText('Lote (ítem 1)'), loteB);

    const cantidad = screen.getByLabelText('Cantidad (ítem 1)');
    await usuario.clear(cantidad);
    await usuario.type(cantidad, '61');
    expect(
      screen.getByText(/supera el disponible del lote en el origen \(60\)/),
    ).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Crear traslado' }));
    expect(await screen.findByText('Supera el disponible en el origen (60).')).toBeInTheDocument();

    await usuario.clear(cantidad);
    await usuario.type(cantidad, '12');
    await usuario.click(screen.getByRole('button', { name: 'Crear traslado' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/traslados/3'));
    expect(await screen.findByRole('heading', { name: 'Traslado #3' })).toBeInTheDocument();
    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar' })).toBeEnabled();
  });
});
