import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '../mocks/server';
import { api, errorApi, tokenMock } from '../mocks/utilidades';
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
    server.use(http.get(api('/bodegas'), () => errorApi(401, 'NO_AUTENTICADO', 'No autenticado.')));
    const { router } = renderApp({ rol: 'regente_farmacia' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText(/Tu sesión expiró/)).toBeInTheDocument();
    expect(sessionStorage.getItem('farma.token')).toBeNull();
  });

  it('Salir voluntario con 401 en el logout: va al login SIN aviso de expiración', async () => {
    server.use(
      http.post(api('/auth/logout'), () => errorApi(401, 'NO_AUTENTICADO', 'No autenticado.')),
    );
    const usuario = userEvent.setup();
    const { router } = renderApp({ rol: 'regente_farmacia' });
    await screen.findByRole('heading', { name: 'Dispensación' });
    await usuario.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(screen.queryByText(/Tu sesión expiró/)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('farma.token')).toBeNull();
  });
});

describe('arranque con token guardado (/auth/me)', () => {
  it('token válido: entra sin pasar por el login', async () => {
    const { router } = renderApp({ tokenGuardado: tokenMock('auxiliar@farma.test') });
    expect(await screen.findByRole('heading', { name: 'Dispensación' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dispensacion');
  });

  it('401: borra el token y muestra el login', async () => {
    const { router } = renderApp({ tokenGuardado: 'mock|desconocido@farma.test' });
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(sessionStorage.getItem('farma.token')).toBeNull();
  });

  it('error de red: avisa, conserva el token y permite reintentar', async () => {
    server.use(http.get(api('/auth/me'), () => HttpResponse.error(), { once: true }));
    const token = tokenMock('auxiliar@farma.test');
    const usuario = userEvent.setup();
    const { router } = renderApp({ tokenGuardado: token });
    expect(await screen.findByText('No se pudo validar la sesión')).toBeInTheDocument();
    expect(router.state.location.pathname).not.toBe('/login');
    expect(sessionStorage.getItem('farma.token')).toBe(token);
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Dispensación' })).toBeInTheDocument();
  });
});
