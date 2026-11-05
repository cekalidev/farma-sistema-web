// Kardex (existe en el backend): listado filtrado e inmutable, en orden ascendente.
// Lee el kardex simulado compartido (`MOVIMIENTOS` de datos.ts); los handlers que mueven
// stock añaden con `registrarMovimiento` (utilidades.ts).
import { http, HttpResponse, type HttpHandler } from 'msw';
import { fechaRelativa } from '../../lib/fechas';
import { MOVIMIENTOS } from '../datos';
import { api, autorizar, errorApi, filtroNum, paginar } from '../utilidades';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha local `Y-m-d` de un timestamp. */
const diaLocal = (marca: string) => fechaRelativa(0, new Date(marca));

export const handlersReales: HttpHandler[] = [
  http.get(api('/kardex'), ({ request }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    const q = new URL(request.url).searchParams;
    const desde = q.get('desde') || undefined;
    const hasta = q.get('hasta') || undefined;
    const campos: Record<string, string[]> = {};
    if (desde && !FECHA.test(desde))
      campos.desde = ['The desde field must match the format Y-m-d.'];
    if (hasta && !FECHA.test(hasta))
      campos.hasta = ['The hasta field must match the format Y-m-d.'];
    if (desde && hasta && hasta < desde) {
      campos.hasta = ['The hasta field must be a date after or equal to desde.'];
    }
    if (Object.keys(campos).length) {
      return errorApi(422, 'VALIDACION', 'Datos inválidos.', { campos });
    }
    const producto = filtroNum(request, 'producto_id');
    const lote = filtroNum(request, 'lote_id');
    const bodega = filtroNum(request, 'bodega_id');
    const existencia = filtroNum(request, 'existencia_id');
    const filas = MOVIMIENTOS.filter((m) => {
      if (producto !== undefined && m.producto_id !== producto) return false;
      if (lote !== undefined && m.lote_id !== lote) return false;
      if (bodega !== undefined && m.bodega_id !== bodega) return false;
      if (existencia !== undefined && m.existencia_id !== existencia) return false;
      const dia = diaLocal(m.created_at);
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
      return true;
    }).toSorted((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    return HttpResponse.json(paginar(filas, request));
  }),

  http.get(api('/kardex/:id'), ({ request, params }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    const mov = MOVIMIENTOS.find((m) => m.id === Number(params.id));
    if (!mov) return errorApi(404, 'NO_ENCONTRADO', 'No encontrado.');
    return HttpResponse.json({ data: mov });
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
