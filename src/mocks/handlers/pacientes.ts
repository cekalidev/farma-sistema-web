// Pacientes y prescripciones. El backend los está incorporando con esta misma forma;
// cuando estén publicados, mover a `handlersReales`.
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Paciente, Usuario } from '../../api/tipos';
import { PACIENTES, PRESCRIPCIONES } from '../datos';
import { api, autorizar, errorApi } from '../utilidades';

const cola = (v: string | null, mascara: string, visibles: number) =>
  v ? (v.length <= visibles ? mascara : `${mascara}${v.slice(-visibles)}`) : null;

const nombre = (v: string) =>
  v
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => `${p[0]}***`)
    .join(' ');

/** Enmascarado para el auditor (como PacienteResource). */
export function enmascarar(p: Paciente): Paciente {
  return {
    id: p.id,
    tipo_documento: p.tipo_documento,
    numero_documento: cola(p.numero_documento, '******', 4) ?? '',
    nombres: nombre(p.nombres),
    apellidos: nombre(p.apellidos),
    fecha_nacimiento: p.fecha_nacimiento ? p.fecha_nacimiento.slice(0, 4) : null,
    telefono: cola(p.telefono, '*******', 3),
    correo: p.correo ? `${p.correo[0]}***@***` : null,
    direccion: null,
    enmascarado: true,
  };
}

export const verPaciente = (p: Paciente, u: Usuario) => (u.rol === 'auditor' ? enmascarar(p) : p);

export const handlersReales: HttpHandler[] = [];

export const handlersFaltantes: HttpHandler[] = [
  http.post(api('/pacientes/buscar'), async ({ request }) => {
    const u = autorizar(request, 'paciente.consultar');
    if (u instanceof Response) return u;
    const cuerpo = (await request.json().catch(() => null)) as {
      tipo_documento?: unknown;
      numero_documento?: unknown;
    } | null;
    const numero =
      typeof cuerpo?.numero_documento === 'string' ? cuerpo.numero_documento.trim() : '';
    if (!numero) {
      return errorApi(422, 'VALIDACION', 'Los datos enviados no son válidos.', {
        campos: { numero_documento: ['The numero documento field is required.'] },
      });
    }
    const tipo = typeof cuerpo?.tipo_documento === 'string' ? cuerpo.tipo_documento : undefined;
    const encontrados = PACIENTES.filter(
      (p) => p.numero_documento === numero && (!tipo || p.tipo_documento === tipo),
    );
    return HttpResponse.json({ data: encontrados.map((p) => verPaciente(p, u)) });
  }),

  http.get(api('/pacientes/:id'), ({ request, params }) => {
    const u = autorizar(request, 'paciente.consultar');
    if (u instanceof Response) return u;
    const p = PACIENTES.find((x) => x.id === Number(params.id));
    if (!p) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
    return HttpResponse.json({ data: verPaciente(p, u) });
  }),

  http.get(api('/pacientes/:id/prescripciones'), ({ request, params }) => {
    const u = autorizar(request, 'paciente.consultar');
    if (u instanceof Response) return u;
    const p = PACIENTES.find((x) => x.id === Number(params.id));
    if (!p) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
    const data = PRESCRIPCIONES.filter((x) => x.paciente_id === p.id)
      .toSorted((a, b) => b.fecha_emision.localeCompare(a.fecha_emision) || b.id - a.id)
      .map((x) => ({
        ...x,
        observaciones: u.rol === 'auditor' ? null : x.observaciones,
        paciente: verPaciente(p, u),
      }));
    return HttpResponse.json({ data });
  }),
];
