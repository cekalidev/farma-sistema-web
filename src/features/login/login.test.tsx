import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '../../mocks/server';
import { api, errorApi } from '../../mocks/utilidades';
import { renderApp } from '../../test/render';

async function ingresar(email: string, password: string) {
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText('Correo'), email);
  await usuario.type(screen.getByLabelText('Contraseña'), password);
  await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
}

describe('login', () => {
  it('éxito: guarda el token y redirige al inicio del rol', async () => {
    const { router } = renderApp({ ruta: '/login' });
    await ingresar('auditor@farma.test', 'Farma2026!');
    await waitFor(() => expect(router.state.location.pathname).toBe('/inventario'));
    expect(sessionStorage.getItem('farma.token')).toBe('mock|auditor@farma.test');
  });

  it('vuelve a la ruta pedida antes del login', async () => {
    const { router } = renderApp({ ruta: '/kardex' });
    await ingresar('regente@farma.test', 'Farma2026!');
    await waitFor(() => expect(router.state.location.pathname).toBe('/kardex'));
  });

  it('credenciales inválidas: mensaje claro', async () => {
    renderApp({ ruta: '/login' });
    await ingresar('auxiliar@farma.test', 'otra-clave');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  it('429: indica los segundos de espera', async () => {
    server.use(
      http.post(api('/auth/login'), () =>
        errorApi(
          429,
          'DEMASIADAS_SOLICITUDES',
          'Demasiados intentos.',
          {},
          { 'Retry-After': '30' },
        ),
      ),
    );
    renderApp({ ruta: '/login' });
    await ingresar('auxiliar@farma.test', 'Farma2026!');
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera 30 segundo(s)');
  });

  it('servidor caído: no se pudo conectar', async () => {
    server.use(http.post(api('/auth/login'), () => HttpResponse.error()));
    renderApp({ ruta: '/login' });
    await ingresar('auxiliar@farma.test', 'Farma2026!');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor',
    );
  });

  it('valida campos antes de enviar', async () => {
    renderApp({ ruta: '/login' });
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Escribe tu correo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
  });
});
