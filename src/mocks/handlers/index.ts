// Combina los handlers por modo: parcial = solo faltantes; todo = reales + faltantes
import type { HttpHandler } from 'msw';
import * as alertas from './alertas';
import * as auth from './auth';
import * as catalogos from './catalogos';
import * as dispensaciones from './dispensaciones';
import * as inventario from './inventario';
import * as kardex from './kardex';
import * as pacientes from './pacientes';
import * as traslados from './traslados';

export type ModoMocks = 'parcial' | 'todo' | 'no';

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

export const handlersReales: HttpHandler[] = MODULOS.flatMap((m) => m.handlersReales);
export const handlersFaltantes: HttpHandler[] = MODULOS.flatMap((m) => m.handlersFaltantes);

/** Los faltantes van primero: rutas específicas antes que las genéricas. */
export function handlersPorModo(modo: ModoMocks): HttpHandler[] {
  if (modo === 'todo') return [...handlersFaltantes, ...handlersReales];
  if (modo === 'parcial') return handlersFaltantes;
  return [];
}

/** Todos (tests). */
export const handlers: HttpHandler[] = handlersPorModo('todo');
