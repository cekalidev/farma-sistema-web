// Utilidades para los handlers MSW
import { HttpResponse } from 'msw';
import type { Habilidad, Paginado, Usuario } from '../api/tipos';
import { USUARIOS } from './datos';

/** Patrón de URL que coincide con cualquier origen: `api('/bodegas')` → `* /api/v1/bodegas`. */
export function api(ruta: string): string {
  return `*/api/v1${ruta}`;
}

/** Token sintético del login mock: `mock|<email>`. */
export function tokenMock(email: string): string {
  return `mock|${email}`;
}

export function errorApi(
  status: number,
  codigo: string,
  mensaje: string,
  detalles: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return HttpResponse.json({ error: { codigo, mensaje, detalles } }, { status, headers });
}

/** Usuario del header Authorization o null. */
export function usuarioDe(request: Request): Usuario | null {
  const auth = request.headers.get('Authorization') ?? '';
  const m = /^Bearer mock\|(.+)$/.exec(auth);
  if (!m) return null;
  return USUARIOS.find((u) => u.email === m[1]) ?? null;
}

/**
 * Autentica y autoriza. Devuelve el usuario o la respuesta de error (401/403).
 * Uso: `const u = autorizar(request, 'inventario.consultar'); if (u instanceof Response) return u;`
 */
export function autorizar(request: Request, ...habilidades: Habilidad[]): Usuario | Response {
  const u = usuarioDe(request);
  if (!u) return errorApi(401, 'NO_AUTENTICADO', 'No autenticado.');
  if (habilidades.length && !habilidades.some((h) => u.habilidades.includes(h))) {
    return errorApi(403, 'NO_AUTORIZADO', 'No tiene permiso para realizar esta acción.');
  }
  return u;
}

/** Paginado estilo Laravel con `por_pagina` y `page` de la URL. */
export function paginar<T>(items: T[], request: Request, porPaginaFija?: number): Paginado<T> {
  const url = new URL(request.url);
  const porPagina =
    porPaginaFija ?? Math.min(Math.max(Number(url.searchParams.get('por_pagina')) || 25, 1), 100);
  const total = items.length;
  const ultima = Math.max(Math.ceil(total / porPagina), 1);
  const pagina = Math.min(Math.max(Number(url.searchParams.get('page')) || 1, 1), ultima);
  const inicio = (pagina - 1) * porPagina;
  const data = items.slice(inicio, inicio + porPagina);
  const path = `${url.origin}${url.pathname}`;
  const enlace = (p: number) => `${path}?page=${p}`;
  return {
    data,
    links: {
      first: enlace(1),
      last: enlace(ultima),
      prev: pagina > 1 ? enlace(pagina - 1) : null,
      next: pagina < ultima ? enlace(pagina + 1) : null,
    },
    meta: {
      current_page: pagina,
      from: total ? inicio + 1 : null,
      last_page: ultima,
      links: [],
      path,
      per_page: porPagina,
      to: total ? inicio + data.length : null,
      total,
    },
  };
}

/** Lee un filtro numérico de la query. */
export function filtroNum(request: Request, clave: string): number | undefined {
  const v = new URL(request.url).searchParams.get(clave);
  return v === null || v === '' ? undefined : Number(v);
}
