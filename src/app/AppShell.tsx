// Marco de la aplicación: navegación por permisos, usuario y salida
import { NavLink, Outlet, useNavigation } from 'react-router';
import { NOMBRE_ROL, puedeVerSeccion, type Seccion } from '../auth/permisos';
import { useAuth } from '../auth/useAuth';
import { Button } from '../components/ui/Button';
import { useAccionUnica } from '../components/ui/useAccionUnica';

const ENLACES: { seccion: Seccion; ruta: string; texto: string }[] = [
  { seccion: 'dispensacion', ruta: '/dispensacion', texto: 'Dispensación' },
  { seccion: 'traslados', ruta: '/traslados', texto: 'Traslados' },
  { seccion: 'inventario', ruta: '/inventario', texto: 'Inventario' },
  { seccion: 'kardex', ruta: '/kardex', texto: 'Kardex' },
];

const claseEnlace = ({ isActive }: { isActive: boolean }) =>
  // Contorno de foco sin separación: cabe en el relleno del nav (que recorta por el scroll)
  `shrink-0 rounded px-2.5 py-1.5 text-sm font-medium focus-visible:outline-offset-0 ${
    isActive ? 'bg-marca-700 text-white' : 'text-slate-700 hover:bg-slate-200'
  }`;

export function AppShell() {
  const { usuario, cerrarSesion } = useAuth();
  const navegando = useNavigation().state === 'loading';
  const salir = useAccionUnica(cerrarSesion);
  const enlaces = ENLACES.filter((e) => puedeVerSeccion(usuario, e.seccion));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white">
        {/* Móvil: fila 1 = marca + usuario + Salir; fila 2 = nav con scroll horizontal */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <span className="shrink-0 font-semibold text-marca-800">
            FARTMAR<span className="hidden sm:inline"> IPS · Farmacia</span>
          </span>
          <nav
            aria-label="Principal"
            className="order-last -mx-1 w-[calc(100%+0.5rem)] overflow-x-auto px-1 py-0.5 [scrollbar-width:thin] sm:order-none sm:w-auto sm:flex-1"
          >
            <div className="flex gap-1">
              {enlaces.map((e) => (
                <NavLink key={e.ruta} to={e.ruta} className={claseEnlace}>
                  {e.texto}
                </NavLink>
              ))}
            </div>
          </nav>
          {usuario ? (
            <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
              <span className="min-w-0 text-right leading-tight">
                <span className="block truncate font-medium">{usuario.nombre}</span>
                <span className="hidden text-xs text-slate-500 sm:block">
                  {NOMBRE_ROL[usuario.rol]}
                </span>
              </span>
              <Button
                variante="secundario"
                tamano="sm"
                className="shrink-0"
                pending={salir.pendiente}
                onClick={() => void salir.ejecutar()}
              >
                Salir
              </Button>
            </div>
          ) : null}
        </div>
        <div
          aria-hidden="true"
          className={`h-0.5 bg-marca-600 transition-opacity ${navegando ? 'animate-pulse opacity-100' : 'opacity-0'}`}
        />
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}
