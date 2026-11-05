// Definición de rutas con carga diferida por pantalla
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { Cargando } from '../components/ui/Cargando';
import { AppShell } from './AppShell';
import { InicioPorRol } from './InicioPorRol';
import { NoEncontrado } from './NoEncontrado';
import { RequireAuth } from './RequireAuth';
import { RutaConPermiso } from './RutaConPermiso';
function CargandoPantalla() {
  return <Cargando />;
}

/** Pantalla diferida; HydrateFallback evita el aviso de React Router en la carga inicial. */
function diferida(cargar: () => Promise<{ default: ComponentType }>) {
  return {
    lazy: async () => ({ Component: (await cargar()).default }),
    HydrateFallback: CargandoPantalla,
  };
}

export const rutas: RouteObject[] = [
  {
    path: '/login',
    ...diferida(() => import('../features/login')),
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
            ...diferida(() => import('../features/dispensacion')),
          },
        ],
      },
      {
        path: 'traslados',
        element: <RutaConPermiso seccion="traslados" />,
        children: [
          {
            index: true,
            ...diferida(() => import('../features/traslados')),
          },
          {
            path: ':id',
            ...diferida(() => import('../features/traslados/detalle')),
          },
        ],
      },
      {
        path: 'inventario',
        element: <RutaConPermiso seccion="inventario" />,
        children: [
          {
            index: true,
            ...diferida(() => import('../features/inventario')),
          },
        ],
      },
      {
        path: 'kardex',
        element: <RutaConPermiso seccion="kardex" />,
        children: [
          {
            index: true,
            ...diferida(() => import('../features/kardex')),
          },
        ],
      },
      { path: '*', element: <NoEncontrado /> },
    ],
  },
];
