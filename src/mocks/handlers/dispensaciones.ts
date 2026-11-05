// Dispensaciones. Reales (previsualizar, crear, autorizar, rechazar): pendientes de mock.
// Faltantes: listado de pendientes y detalle.
import { http, HttpResponse, type HttpHandler } from 'msw';
import { DISPENSACIONES, PACIENTES } from '../datos';
import { api, autorizar, errorApi, filtroNum, paginar } from '../utilidades';
import { verPaciente } from './pacientes';

export const handlersReales: HttpHandler[] = [];

export const handlersFaltantes: HttpHandler[] = [
  http.get(api('/dispensaciones'), ({ request }) => {
    const u = autorizar(request, 'dispensacion.crear', 'dispensacion.autorizar');
    if (u instanceof Response) return u;
    const estado = new URL(request.url).searchParams.get('estado');
    const bodega = filtroNum(request, 'bodega_id');
    const filas = DISPENSACIONES.filter(
      (d) => (!estado || d.estado === estado) && (bodega === undefined || d.bodega_id === bodega),
    ).toSorted((a, b) => b.id - a.id);
    return HttpResponse.json(paginar(filas, request));
  }),

  http.get(api('/dispensaciones/:id'), ({ request, params }) => {
    const u = autorizar(
      request,
      'dispensacion.crear',
      'dispensacion.autorizar',
      'auditoria.consultar',
    );
    if (u instanceof Response) return u;
    const d = DISPENSACIONES.find((x) => x.id === Number(params.id));
    if (!d) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
    const p = PACIENTES.find((x) => x.id === d.paciente_id);
    return HttpResponse.json({ data: { ...d, ...(p ? { paciente: verPaciente(p, u) } : {}) } });
  }),
];
