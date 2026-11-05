// Kardex (existe en el backend). Mínimo: listado vacío.
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { MovimientoKardex } from '../../api/tipos';
import { api, autorizar, paginar } from '../utilidades';

export const handlersReales: HttpHandler[] = [
  http.get(api('/kardex'), ({ request }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    return HttpResponse.json(paginar<MovimientoKardex>([], request));
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
