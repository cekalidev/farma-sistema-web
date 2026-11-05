// Catálogos (existen en el backend)
import { http, HttpResponse, type HttpHandler } from 'msw';
import { BODEGAS, PRODUCTOS } from '../datos';
import { api, autorizar, paginar } from '../utilidades';

export const handlersReales: HttpHandler[] = [
  http.get(api('/bodegas'), ({ request }) => {
    const u = autorizar(request, 'bodega.consultar');
    if (u instanceof Response) return u;
    return HttpResponse.json(paginar(BODEGAS, request, 25));
  }),

  http.get(api('/productos'), ({ request }) => {
    const u = autorizar(request, 'producto.consultar');
    if (u instanceof Response) return u;
    return HttpResponse.json(paginar(PRODUCTOS, request));
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
