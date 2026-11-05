// Pacientes y prescripciones (existen en el backend: buscar, detalle y prescripciones)
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Paciente, Prescripcion, TipoDocumento, Usuario } from '../../api/tipos';
import { DISPENSACIONES, PACIENTES, PRESCRIPCIONES } from '../datos';
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

const TIPOS: TipoDocumento[] = ['CC', 'TI', 'CE', 'PA', 'RC'];
const CLAVES_BUSCAR = ['numero_documento', 'tipo_documento'];

function validacion(campos: Record<string, string[]>) {
  return errorApi(422, 'VALIDACION', 'Los datos enviados no son válidos.', { campos });
}

/** 401 → 404 → 403 (§1.8): primero autentica, luego busca y al final exige la habilidad. */
function pacienteConPermiso(request: Request, id: unknown): [Usuario, Paciente] | Response {
  const u = autorizar(request);
  if (u instanceof Response) return u;
  const p = PACIENTES.find((x) => x.id === Number(id));
  if (!p) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
  const permitido = autorizar(request, 'paciente.consultar');
  if (permitido instanceof Response) return permitido;
  return [u, p];
}

/** Unidades ya comprometidas por ítem (CONFIRMADA + PENDIENTE_AUTORIZACION, como CalculadorPendiente). */
export function comprometidoPorItem(itemId: number): number {
  let total = 0;
  for (const d of DISPENSACIONES) {
    if (d.estado === 'RECHAZADA') continue;
    for (const i of d.items) if (i.prescripcion_item_id === itemId) total += i.cantidad;
  }
  return total;
}

/** Pendiente por dispensar de un ítem prescrito (nunca negativo). */
export function pendienteDeItem(itemId: number, prescrita: number): number {
  return Math.max(0, prescrita - comprometidoPorItem(itemId));
}

/** Prescripción con `cantidad_pendiente` recalculada desde las dispensaciones. */
export function conPendientes(p: Prescripcion): Prescripcion {
  return {
    ...p,
    items: p.items.map((i) => ({
      ...i,
      cantidad_pendiente: pendienteDeItem(i.id, i.cantidad_prescrita),
    })),
  };
}

export const handlersReales: HttpHandler[] = [
  http.post(api('/pacientes/buscar'), async ({ request }) => {
    const u = autorizar(request, 'paciente.consultar');
    if (u instanceof Response) return u;
    const cuerpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const campos: Record<string, string[]> = {};
    const numero =
      typeof cuerpo.numero_documento === 'string' ? cuerpo.numero_documento.trim() : '';
    if (!numero) campos.numero_documento = ['The numero documento field is required.'];
    else if (numero.length > 20 || !/^[A-Za-z0-9-]+$/.test(numero))
      campos.numero_documento = ['The numero documento field format is invalid.'];
    const tipo = cuerpo.tipo_documento;
    if (tipo !== undefined && tipo !== null && !TIPOS.includes(tipo as TipoDocumento))
      campos.tipo_documento = ['The selected tipo documento is invalid.'];
    for (const k of Object.keys(cuerpo))
      if (!CLAVES_BUSCAR.includes(k)) campos[k] = ['Campo no permitido.'];
    if (Object.keys(campos).length) return validacion(campos);
    const encontrados = PACIENTES.filter(
      (p) => p.numero_documento === numero && (!tipo || p.tipo_documento === tipo),
    );
    return HttpResponse.json({ data: encontrados.map((p) => verPaciente(p, u)) });
  }),

  http.get(api('/pacientes/:id'), ({ request, params }) => {
    const r = pacienteConPermiso(request, params.id);
    if (r instanceof Response) return r;
    const [u, p] = r;
    return HttpResponse.json({ data: verPaciente(p, u) });
  }),

  http.get(api('/pacientes/:id/prescripciones'), ({ request, params }) => {
    const r = pacienteConPermiso(request, params.id);
    if (r instanceof Response) return r;
    const [u, p] = r;
    const auditor = u.rol === 'auditor';
    const data = PRESCRIPCIONES.filter((x) => x.paciente_id === p.id)
      .toSorted((a, b) => b.fecha_emision.localeCompare(a.fecha_emision) || b.id - a.id)
      .map((x) => {
        const c = conPendientes(x);
        // Auditor: observaciones e indicaciones salen null (RN-10)
        return {
          ...c,
          observaciones: auditor ? null : c.observaciones,
          items: auditor ? c.items.map((i) => ({ ...i, indicaciones: null })) : c.items,
          paciente: verPaciente(p, u),
        };
      });
    return HttpResponse.json({ data });
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
