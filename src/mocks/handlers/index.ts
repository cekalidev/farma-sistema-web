// Handlers MSW. Dos modos: `todo` = demo sin backend (MSW simula toda la API);
// `no` = backend real, sin MSW. No hay mezcla: con backend real nada se simula.
import type { HttpHandler } from 'msw';
import * as alertas from './alertas';
import * as auth from './auth';
import * as catalogos from './catalogos';
import * as dispensaciones from './dispensaciones';
import * as inventario from './inventario';
import * as kardex from './kardex';
import * as pacientes from './pacientes';
import * as traslados from './traslados';

export type ModoMocks = 'todo' | 'no';

const MODULOS = [
  auth,
  catalogos,
  inventario,
  kardex,
  dispensaciones,
  traslados,
  pacientes,
  alertas,
];

/** Endpoints que el backend tiene (simulados con su misma forma). */
export const handlersReales: HttpHandler[] = MODULOS.flatMap((m) => m.handlersReales);
/**
 * Endpoints anunciados en el contrato pero aún no publicados en el backend: hoy solo
 * `GET /dispensaciones` (listado). Las alertas (`/alertas/*`) ya existen (v0.12.0) y van en
 * `handlersReales`. Con backend real, la UI degrada ante 404/405.
 */
export const handlersFaltantes: HttpHandler[] = MODULOS.flatMap((m) => m.handlersFaltantes);

/** Lista completa. Los faltantes van primero: rutas específicas antes que las genéricas. */
export const handlers: HttpHandler[] = [...handlersFaltantes, ...handlersReales];

export function handlersPorModo(modo: ModoMocks): HttpHandler[] {
  return modo === 'todo' ? handlers : [];
}
