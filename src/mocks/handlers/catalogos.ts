// Catálogos (existen en el backend, §4.2): paginados (`por_pagina` 1–100, 25 por defecto;
// `page` ≤ 1.000.000), orden por nombre y luego id; fuera de rango → 422 VALIDACION.
import { http, HttpResponse, type HttpHandler } from 'msw';
import { BODEGAS, PRODUCTOS } from '../datos';
import { api, autorizar, errorApi, paginar } from '../utilidades';

/** 422 si `por_pagina` o `page` no son enteros dentro de los límites del contrato (§1.5). */
function validarPaginacion(request: Request): Response | null {
  const q = new URL(request.url).searchParams;
  const campos: Record<string, string[]> = {};
  const porPagina = q.get('por_pagina');
  if (porPagina !== null && !/^(100|[1-9]\d?)$/.test(porPagina)) {
    campos.por_pagina = ['The por pagina field must be between 1 and 100.'];
  }
  const page = q.get('page');
  if (page !== null && !(/^[1-9]\d{0,6}$/.test(page) && Number(page) <= 1_000_000)) {
    campos.page = ['The page field must be between 1 and 1000000.'];
  }
  return Object.keys(campos).length
    ? errorApi(422, 'VALIDACION', 'Los datos enviados no son válidos.', { campos })
    : null;
}

const porNombre = <T extends { id: number; nombre: string }>(items: T[]): T[] =>
  items.toSorted((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id);

export const handlersReales: HttpHandler[] = [
  http.get(api('/bodegas'), ({ request }) => {
    const u = autorizar(request, 'bodega.consultar');
    if (u instanceof Response) return u;
    const invalido = validarPaginacion(request);
    if (invalido) return invalido;
    return HttpResponse.json(paginar(porNombre(BODEGAS), request));
  }),

  http.get(api('/productos'), ({ request }) => {
    const u = autorizar(request, 'producto.consultar');
    if (u instanceof Response) return u;
    const invalido = validarPaginacion(request);
    if (invalido) return invalido;
    return HttpResponse.json(paginar(porNombre(PRODUCTOS), request));
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
