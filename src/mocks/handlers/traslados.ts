// Traslados (existen en el backend). Mínimo: listado y detalle.
import { http, HttpResponse, type HttpHandler } from 'msw';
import { TRASLADOS } from '../datos';
import { api, autorizar, errorApi, filtroNum, paginar } from '../utilidades';

export const handlersReales: HttpHandler[] = [
  http.get(api('/traslados'), ({ request }) => {
    const u = autorizar(request, 'traslado.consultar');
    if (u instanceof Response) return u;
    const estado = new URL(request.url).searchParams.get('estado');
    const bodega = filtroNum(request, 'bodega_id');
    const filas = TRASLADOS.filter(
      (t) =>
        (!estado || t.estado === estado) &&
        (bodega === undefined || t.bodega_origen_id === bodega || t.bodega_destino_id === bodega),
    ).toSorted((a, b) => b.id - a.id);
    return HttpResponse.json(paginar(filas, request));
  }),

  http.get(api('/traslados/:id'), ({ request, params }) => {
    const u = autorizar(request, 'traslado.consultar');
    if (u instanceof Response) return u;
    const t = TRASLADOS.find((x) => x.id === Number(params.id));
    if (!t) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
    return HttpResponse.json({ data: t });
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
