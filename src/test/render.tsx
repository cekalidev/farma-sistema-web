// Utilidades de render para tests: QueryClient nuevo, router en memoria y sesión opcional
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { establecerToken } from '../api/client';
import type { Rol, Usuario } from '../api/tipos';
import { rutas } from '../app/rutas';
import { AuthProvider, CLAVE_TOKEN } from '../auth/AuthProvider';
import { usuarioPorRol } from '../mocks/datos';
import { tokenMock } from '../mocks/utilidades';

export function crearQueryClientTest(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

interface OpcionesSesion {
  /** Rol del usuario autenticado (usa el usuario demo de ese rol). */
  rol?: Rol;
  /** Usuario explícito (tiene prioridad sobre `rol`). */
  usuario?: Usuario;
  /**
   * Token ya guardado en sessionStorage SIN usuario inicial: el AuthProvider lo valida con
   * GET /auth/me como en un arranque real. Ej.: `tokenGuardado: tokenMock('regente@farma.test')`.
   */
  tokenGuardado?: string;
}

/** Props del AuthProvider: con `tokenGuardado` no se pasa usuarioInicial (arranque real). */
function propsAuth(u: Usuario | null, tokenGuardado?: string) {
  if (tokenGuardado !== undefined) {
    sessionStorage.setItem(CLAVE_TOKEN, tokenGuardado);
    return {};
  }
  return { usuarioInicial: u };
}

/** Prepara el token mock del usuario para que MSW lo reconozca. */
function prepararSesion({ rol, usuario }: OpcionesSesion): Usuario | null {
  const u = usuario ?? (rol ? usuarioPorRol(rol) : null);
  if (u) {
    const token = tokenMock(u.email);
    establecerToken(token);
    sessionStorage.setItem(CLAVE_TOKEN, token);
  }
  return u;
}

interface OpcionesRender extends OpcionesSesion, Omit<RenderOptions, 'wrapper'> {
  /** Ruta inicial del MemoryRouter. */
  ruta?: string;
}

/** Renderiza un componente con QueryClient, MemoryRouter y AuthProvider. */
export function renderConProveedores(ui: ReactElement, opciones: OpcionesRender = {}) {
  const { rol, usuario, tokenGuardado, ruta = '/', ...resto } = opciones;
  const u = prepararSesion({ ...(rol ? { rol } : {}), ...(usuario ? { usuario } : {}) });
  const auth = propsAuth(u, tokenGuardado);
  const queryClient = crearQueryClientTest();
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider {...auth}>
        <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Envoltura, ...resto }), queryClient, usuario: u };
}

/** Renderiza la app completa (rutas reales, lazy) en memoria. */
export function renderApp(opciones: OpcionesSesion & { ruta?: string } = {}) {
  const { ruta = '/', tokenGuardado, ...sesion } = opciones;
  const u = prepararSesion(sesion);
  const auth = propsAuth(u, tokenGuardado);
  const queryClient = crearQueryClientTest();
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider {...auth}>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>,
  );
  return { ...resultado, router, queryClient, usuario: u };
}
