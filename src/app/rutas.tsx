// Definición de rutas con carga diferida por pantalla
import type { RouteObject } from 'react-router';
import { AppShell } from './AppShell';
import { InicioPorRol } from './InicioPorRol';
import { NoEncontrado } from './NoEncontrado';
import { RequireAuth } from './RequireAuth';
import { RutaConPermiso } from './RutaConPermiso';
export const rutas: RouteObject[] = [
  {
    path: '/login',
    lazy: async () => ({ Component: (await import('../features/login')).default }),
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <InicioPorRol /> },
      {
        path: 'dispensacion',
        element: <RutaConPermiso seccion="dispensacion" />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('../features/dispensacion')).default }),
          },
        ],
      },
      {
        path: 'traslados',
        element: <RutaConPermiso seccion="traslados" />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('../features/traslados')).default }),
          },
          {
            path: ':id',
            lazy: async () => ({
              Component: (await import('../features/traslados/detalle')).default,
            }),
          },
        ],
      },
      {
        path: 'inventario',
        element: <RutaConPermiso seccion="inventario" />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('../features/inventario')).default }),
          },
        ],
      },
      {
        path: 'kardex',
        element: <RutaConPermiso seccion="kardex" />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('../features/kardex')).default }),
          },
        ],
      },
      { path: '*', element: <NoEncontrado /> },
    ],
  },
];
