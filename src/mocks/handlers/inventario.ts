// Inventario (existe en el backend). Mínimo: consulta con filtros.
import { http, HttpResponse, type HttpHandler } from 'msw';
import { EXISTENCIAS } from '../datos';
import { api, autorizar, filtroNum, paginar } from '../utilidades';

export const handlersReales: HttpHandler[] = [
  http.get(api('/inventario'), ({ request }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    const bodega = filtroNum(request, 'bodega_id');
    const producto = filtroNum(request, 'producto_id');
    const lote = filtroNum(request, 'lote_id');
    const filas = EXISTENCIAS.filter(
      (e) =>
        (bodega === undefined || e.bodega_id === bodega) &&
        (producto === undefined || e.producto_id === producto) &&
        (lote === undefined || e.lote_id === lote),
    );
    return HttpResponse.json(paginar(filas, request));
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
