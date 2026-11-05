import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '../mocks/server';
import { api, errorApi } from '../mocks/utilidades';
import { renderApp } from '../test/render';

const enlacesNav = () =>
  within(screen.getByRole('navigation', { name: 'Principal' }))
    .queryAllByRole('link')
    .map((a) => a.textContent);

describe('navegación por rol', () => {
  it('auxiliar: inicio en dispensación y nav sin restricciones de auditor', async () => {
    const { router } = renderApp({ rol: 'auxiliar_farmacia' });
    expect(await screen.findByRole('heading', { name: 'Dispensación' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dispensacion');
    expect(enlacesNav()).toEqual(['Dispensación', 'Traslados', 'Inventario', 'Kardex']);
    expect(screen.getByText('Auxiliar Demo')).toBeInTheDocument();
  });

  it('auditor: inicio en inventario, sin dispensación', async () => {
    const { router } = renderApp({ rol: 'auditor' });
    expect(await screen.findByRole('heading', { name: 'Inventario' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/inventario');
    expect(enlacesNav()).toEqual(['Traslados', 'Inventario', 'Kardex']);
  });

  it('auditor en /dispensacion ve mensaje de sin permiso', async () => {
    renderApp({ rol: 'auditor', ruta: '/dispensacion' });
    expect(await screen.findByText('Tu rol no tiene acceso a esta sección.')).toBeInTheDocument();
  });

  it('médico: su rol no tiene pantallas', async () => {
    renderApp({ rol: 'medico' });
    expect(await screen.findByText('Tu rol no tiene pantallas en este módulo')).toBeInTheDocument();
    expect(enlacesNav()).toEqual([]);
  });

  it('sin sesión redirige a /login', async () => {
    const { router } = renderApp({ ruta: '/kardex' });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('401 en una petición: limpia la sesión y avisa en el login', async () => {
    server.use(
      http.post(api('/auth/logout'), () => errorApi(401, 'NO_AUTENTICADO', 'No autenticado.')),
    );
    const usuario = userEvent.setup();
    const { router } = renderApp({ rol: 'regente_farmacia' });
    await screen.findByRole('heading', { name: 'Dispensación' });
    await usuario.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText(/Tu sesión expiró/)).toBeInTheDocument();
    expect(sessionStorage.getItem('farma.token')).toBeNull();
  });
});
