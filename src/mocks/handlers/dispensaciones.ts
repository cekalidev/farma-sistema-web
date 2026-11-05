// Dispensaciones. Reales (fieles al backend): previsualizar, crear (idempotente), autorizar,
// rechazar y detalle. Listado `GET /dispensaciones`, publicado desde v0.13.0 (filas con
// `dispensado_por {id, nombre}`, sin `paciente` ni `detalles`); la UI degrada con backends anteriores.
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { DispensacionListado } from '../../api/endpoints/dispensaciones';
import type {
  Dispensacion,
  DispensacionDetalle,
  Existencia,
  EstadoDispensacion,
  Prescripcion,
  PrescripcionItem,
  Rol,
  SolicitudDispensacion,
  Usuario,
} from '../../api/tipos';
import { diasHastaVencer, hoyISO, marcaEnBogota } from '../../lib/fechas';
import {
  BODEGAS,
  DISPENSACIONES,
  EXISTENCIAS,
  PACIENTES,
  PRESCRIPCIONES,
  USUARIOS,
} from '../datos';
import { api, autorizar, errorApi, filtroNum, paginar, registrarMovimiento } from '../utilidades';
import { pendienteDeItem, verPaciente } from './pacientes';

// ---------- Estado mutable y reinicio (tests) ----------

const existenciasIniciales = EXISTENCIAS.map((e) => ({ id: e.id, cantidad: e.cantidad }));
const dispensacionesIniciales: Dispensacion[] = structuredClone(DISPENSACIONES);

interface Registrada {
  hash: string;
  cuerpo: string;
}
/** `usuario|clave` → hash del cuerpo y respuesta guardada. */
const idempotencia = new Map<string, Registrada>();
let secuenciaItem = 1000;
let secuenciaDetalle = 1000;

/** Restaura existencias, dispensaciones y el registro de idempotencia. */
export function reiniciarDispensaciones(): void {
  for (const inicial of existenciasIniciales) {
    const e = EXISTENCIAS.find((x) => x.id === inicial.id);
    if (e) e.cantidad = inicial.cantidad;
  }
  DISPENSACIONES.splice(0, DISPENSACIONES.length, ...structuredClone(dispensacionesIniciales));
  idempotencia.clear();
}

// ---------- FEFO ----------

export class StockInsuficienteMock extends Error {
  readonly solicitado: number;
  readonly disponible: number;
  readonly vencido: number;
  constructor(solicitado: number, disponible: number, vencido: number) {
    super('Stock insuficiente');
    this.solicitado = solicitado;
    this.disponible = disponible;
    this.vencido = vencido;
  }
}

/**
 * Asignación FEFO (como AsignadorFefo): excluye lotes vencidos (vence hoy o antes), ordena por
 * vencimiento, lote e id y toma de varios lotes si hace falta. Devuelve [existencia, cantidad].
 */
export function asignarFefo(
  existencias: Existencia[],
  cantidad: number,
  hoy: string = hoyISO(),
): [Existencia, number][] {
  const vigentes: Existencia[] = [];
  let vencido = 0;
  for (const e of existencias) {
    if (e.cantidad <= 0) continue;
    if (e.lote.fecha_vencimiento <= hoy) {
      vencido += e.cantidad;
      continue;
    }
    vigentes.push(e);
  }
  vigentes.sort(
    (a, b) =>
      a.lote.fecha_vencimiento.localeCompare(b.lote.fecha_vencimiento) ||
      a.lote_id - b.lote_id ||
      a.id - b.id,
  );
  const disponible = vigentes.reduce((s, e) => s + e.cantidad, 0);
  if (disponible < cantidad) throw new StockInsuficienteMock(cantidad, disponible, vencido);
  const tramos: [Existencia, number][] = [];
  let restante = cantidad;
  for (const e of vigentes) {
    const tomar = Math.min(restante, e.cantidad);
    tramos.push([e, tomar]);
    restante -= tomar;
    if (restante === 0) break;
  }
  return tramos;
}

// ---------- Validación y reglas ----------

const CLAVES_RAIZ = ['paciente_id', 'prescripcion_id', 'bodega_id', 'items'];
const esId = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;

function validacion(campos: Record<string, string[]>) {
  return errorApi(422, 'VALIDACION', 'Los datos enviados no son válidos.', { campos });
}

/** Valida el cuerpo como StoreDispensacionRequest. Devuelve la solicitud normalizada o un 422. */
function validarCuerpo(cuerpo: unknown): SolicitudDispensacion | Response {
  const campos: Record<string, string[]> = {};
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  for (const k of ['paciente_id', 'prescripcion_id', 'bodega_id']) {
    if (c[k] === undefined || c[k] === null) campos[k] = [`The ${k} field is required.`];
    else if (!esId(c[k])) campos[k] = [`The ${k} field must be an integer.`];
  }
  if (esId(c.paciente_id) && !PACIENTES.some((p) => p.id === c.paciente_id))
    campos.paciente_id = ['The selected paciente id is invalid.'];
  if (esId(c.prescripcion_id) && !PRESCRIPCIONES.some((p) => p.id === c.prescripcion_id))
    campos.prescripcion_id = ['The selected prescripcion id is invalid.'];
  if (esId(c.bodega_id) && !BODEGAS.some((b) => b.id === c.bodega_id && b.activa))
    campos.bodega_id = ['La bodega no existe o está inactiva.'];
  const items = c.items;
  if (!Array.isArray(items) || items.length === 0) {
    campos.items = ['The items field must have at least 1 items.'];
  } else {
    const vistos = new Set<number>();
    items.forEach((raw: unknown, i) => {
      const it = (raw ?? {}) as Record<string, unknown>;
      for (const k of Object.keys(it)) {
        if (k !== 'prescripcion_item_id' && k !== 'cantidad')
          campos[`items.${i}.${k}`] = ['Campo no permitido.'];
      }
      const id = it.prescripcion_item_id;
      if (!esId(id)) campos[`items.${i}.prescripcion_item_id`] = ['The field is required.'];
      else if (vistos.has(id))
        campos[`items.${i}.prescripcion_item_id`] = ['The field has a duplicate value.'];
      else vistos.add(id);
      const cant = it.cantidad;
      if (typeof cant !== 'number' || !Number.isInteger(cant))
        campos[`items.${i}.cantidad`] = [`The items.${i}.cantidad field must be an integer.`];
      else if (cant < 1)
        campos[`items.${i}.cantidad`] = [`The items.${i}.cantidad field must be at least 1.`];
    });
  }
  for (const k of Object.keys(c)) if (!CLAVES_RAIZ.includes(k)) campos[k] = ['Campo no permitido.'];
  if (Object.keys(campos).length) return validacion(campos);
  return {
    paciente_id: c.paciente_id as number,
    prescripcion_id: c.prescripcion_id as number,
    bodega_id: c.bodega_id as number,
    items: (items as { prescripcion_item_id: number; cantidad: number }[]).map((i) => ({
      prescripcion_item_id: i.prescripcion_item_id,
      cantidad: i.cantidad,
    })),
  };
}

interface Contexto {
  prescripcion: Prescripcion;
  prescritos: Map<number, PrescripcionItem>;
}

/** Correspondencia → vigencia → tope pendiente (mismo orden que el backend). */
function reglasPrescripcion(s: SolicitudDispensacion): Contexto | Response {
  const prescripcion = PRESCRIPCIONES.find((p) => p.id === s.prescripcion_id);
  if (!prescripcion) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
  if (prescripcion.paciente_id !== s.paciente_id) {
    return errorApi(422, 'PRESCRIPCION_NO_CORRESPONDE', 'La prescripción no es del paciente.', {
      prescripcion_id: prescripcion.id,
      paciente_id: s.paciente_id,
    });
  }
  const prescritos = new Map(prescripcion.items.map((i) => [i.id, i]));
  const ajenos = s.items.map((i) => i.prescripcion_item_id).filter((id) => !prescritos.has(id));
  if (ajenos.length) {
    return errorApi(422, 'PRESCRIPCION_NO_CORRESPONDE', 'Ítems ajenos a la prescripción.', {
      prescripcion_id: prescripcion.id,
      prescripcion_item_ids: ajenos,
    });
  }
  if (prescripcion.estado !== 'ACTIVA' || prescripcion.fecha_vencimiento < hoyISO()) {
    return errorApi(422, 'PRESCRIPCION_NO_VIGENTE', 'La prescripción no está vigente.', {
      prescripcion_id: prescripcion.id,
      estado: prescripcion.estado,
      fecha_vencimiento: prescripcion.fecha_vencimiento,
    });
  }
  for (const solicitado of s.items) {
    const item = prescritos.get(solicitado.prescripcion_item_id);
    if (!item) continue;
    const pendiente = pendienteDeItem(item.id, item.cantidad_prescrita);
    if (solicitado.cantidad > pendiente) {
      return errorApi(422, 'CANTIDAD_EXCEDE_PRESCRITO', 'La cantidad supera lo pendiente.', {
        prescripcion_item_id: item.id,
        pendiente,
        solicitado: solicitado.cantidad,
      });
    }
  }
  return { prescripcion, prescritos };
}

type Asignacion = { item: PrescripcionItem; cantidad: number; tramos: [Existencia, number][] }[];

/** FEFO de todos los ítems; 409 STOCK_INSUFICIENTE con el contexto del ítem. */
function asignarTodos(
  s: SolicitudDispensacion,
  prescritos: Map<number, PrescripcionItem>,
): Asignacion | Response {
  const salida: Asignacion = [];
  for (const solicitado of s.items) {
    const item = prescritos.get(solicitado.prescripcion_item_id);
    if (!item) continue;
    const candidatas = EXISTENCIAS.filter(
      (e) => e.bodega_id === s.bodega_id && e.producto_id === item.producto_id,
    );
    try {
      salida.push({
        item,
        cantidad: solicitado.cantidad,
        tramos: asignarFefo(candidatas, solicitado.cantidad),
      });
    } catch (e) {
      if (!(e instanceof StockInsuficienteMock)) throw e;
      return errorApi(409, 'STOCK_INSUFICIENTE', 'Stock insuficiente.', {
        producto_id: item.producto_id,
        bodega_id: s.bodega_id,
        prescripcion_item_id: item.id,
        solicitado: e.solicitado,
        disponible: e.disponible,
        vencido_no_dispensable: e.vencido,
      });
    }
  }
  return salida;
}

/** Descuenta los tramos y devuelve los detalles con su movimiento en el kardex compartido. */
function descontar(
  d: Dispensacion,
  asignacion: Asignacion,
  usuario: Usuario,
): DispensacionDetalle[] {
  const detalles: DispensacionDetalle[] = [];
  for (const { item, tramos } of asignacion) {
    const dItem = d.items.find((x) => x.prescripcion_item_id === item.id);
    for (const [e, cantidad] of tramos) {
      const anterior = e.cantidad;
      e.cantidad -= cantidad;
      e.vencido = diasHastaVencer(e.lote.fecha_vencimiento) <= 0;
      const movimiento = registrarMovimiento({
        tipo: 'SALIDA_DISPENSACION',
        existencia: e,
        cantidad: -cantidad,
        saldoAnterior: anterior,
        usuarioId: usuario.id,
        documento: { tipo: 'dispensacion', id: d.id },
      });
      detalles.push({
        id: secuenciaDetalle++,
        dispensacion_item_id: dItem?.id ?? 0,
        prescripcion_item_id: item.id,
        existencia_id: e.id,
        producto_id: e.producto_id,
        lote_id: e.lote_id,
        lote: { ...e.lote },
        cantidad,
        movimiento,
      });
    }
  }
  return detalles;
}

async function leerJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

function buscarDispensacion(id: unknown): Dispensacion | undefined {
  return DISPENSACIONES.find((x) => x.id === Number(id));
}

/** Segregación + estado pendiente (AutorizacionDispensacion). */
function exigirAutorizable(d: Dispensacion, u: Usuario, accion: string): Response | null {
  if (d.dispensado_por_id === u.id) {
    return errorApi(403, 'AUTORIZACION_MISMO_USUARIO', 'Debe autorizarla otro regente.', {
      dispensacion_id: d.id,
    });
  }
  if (d.estado !== 'PENDIENTE_AUTORIZACION') {
    return errorApi(409, 'TRANSICION_INVALIDA', 'Transición inválida.', {
      dispensacion_id: d.id,
      estado: d.estado,
      accion,
    });
  }
  return null;
}

const ROLES_CONSULTA: Rol[] = ['auxiliar_farmacia', 'regente_farmacia', 'auditor'];
const ESTADOS: EstadoDispensacion[] = ['CONFIRMADA', 'PENDIENTE_AUTORIZACION', 'RECHAZADA'];

const prohibido = () =>
  errorApi(403, 'NO_AUTORIZADO', 'No tiene permiso para realizar esta acción.');

/** Fila del listado (contrato v0.13.0): el recurso + `dispensado_por`, sin `paciente` ni `detalles`. */
function filaListado(d: Dispensacion): DispensacionListado {
  const creador = USUARIOS.find((x) => x.id === d.dispensado_por_id);
  return {
    id: d.id,
    estado: d.estado,
    paciente_id: d.paciente_id,
    prescripcion_id: d.prescripcion_id,
    bodega_id: d.bodega_id,
    dispensado_por_id: d.dispensado_por_id,
    dispensado_por: { id: d.dispensado_por_id, nombre: creador?.nombre ?? '' },
    autorizado_por_id: d.autorizado_por_id,
    autorizado_en: d.autorizado_en,
    rechazado_por_id: d.rechazado_por_id,
    rechazado_en: d.rechazado_en,
    motivo_rechazo: d.motivo_rechazo,
    items: d.items,
    created_at: d.created_at,
  };
}

export const handlersReales: HttpHandler[] = [
  http.post(api('/dispensaciones/previsualizar'), async ({ request }) => {
    const u = autorizar(request, 'dispensacion.crear');
    if (u instanceof Response) return u;
    const s = validarCuerpo(await leerJson(request));
    if (s instanceof Response) return s;
    const ctx = reglasPrescripcion(s);
    if (ctx instanceof Response) return ctx;
    const asignacion = asignarTodos(s, ctx.prescritos);
    if (asignacion instanceof Response) return asignacion;
    return HttpResponse.json({
      data: {
        bodega_id: s.bodega_id,
        orientativa: true,
        items: asignacion.map(({ item, cantidad }) => ({
          prescripcion_item_id: item.id,
          producto_id: item.producto_id,
          producto: { ...item.producto },
          cantidad,
        })),
        detalles: asignacion.flatMap(({ item, tramos }) =>
          tramos.map(([e, cantidad]) => ({
            prescripcion_item_id: item.id,
            existencia_id: e.id,
            producto_id: e.producto_id,
            lote_id: e.lote_id,
            lote: { ...e.lote },
            cantidad,
          })),
        ),
      },
    });
  }),

  http.post(api('/dispensaciones'), async ({ request }) => {
    const u = autorizar(request, 'dispensacion.crear');
    if (u instanceof Response) return u;
    const clave = request.headers.get('Idempotency-Key');
    if (!clave || !clave.trim() || clave.length > 255 || !/^[\x20-\x7E]+$/.test(clave)) {
      return errorApi(
        400,
        'IDEMPOTENCY_KEY_REQUERIDA',
        'La cabecera Idempotency-Key es obligatoria.',
      );
    }
    const s = validarCuerpo(await leerJson(request));
    if (s instanceof Response) return s;

    // Reintento: misma clave del mismo usuario
    const hash = JSON.stringify(s);
    const registro = `${u.id}|${clave}`;
    const previa = idempotencia.get(registro);
    if (previa) {
      if (previa.hash !== hash) {
        return errorApi(
          422,
          'IDEMPOTENCY_KEY_REUTILIZADA',
          'La Idempotency-Key ya se usó con otro cuerpo.',
        );
      }
      return HttpResponse.json(JSON.parse(previa.cuerpo) as { data: Dispensacion }, {
        status: 201,
        headers: { 'Idempotent-Replayed': 'true' },
      });
    }

    const ctx = reglasPrescripcion(s);
    if (ctx instanceof Response) return ctx;
    // Con control especial también se comprueba el stock (sin descontar).
    const asignacion = asignarTodos(s, ctx.prescritos);
    if (asignacion instanceof Response) return asignacion;

    const requiereAutorizacion = asignacion.some(({ item }) => item.producto.control_especial);
    const d: Dispensacion = {
      id: Math.max(0, ...DISPENSACIONES.map((x) => x.id)) + 1,
      estado: requiereAutorizacion ? 'PENDIENTE_AUTORIZACION' : 'CONFIRMADA',
      paciente_id: s.paciente_id,
      prescripcion_id: s.prescripcion_id,
      bodega_id: s.bodega_id,
      dispensado_por_id: u.id,
      autorizado_por_id: null,
      autorizado_en: null,
      rechazado_por_id: null,
      rechazado_en: null,
      motivo_rechazo: null,
      items: asignacion.map(({ item, cantidad }) => ({
        id: secuenciaItem++,
        prescripcion_item_id: item.id,
        producto_id: item.producto_id,
        producto: { ...item.producto },
        cantidad,
      })),
      detalles: [],
      created_at: marcaEnBogota(),
    };
    if (!requiereAutorizacion) d.detalles = descontar(d, asignacion, u);
    DISPENSACIONES.push(d);
    const cuerpo = JSON.stringify({ data: d });
    idempotencia.set(registro, { hash, cuerpo });
    return HttpResponse.json(JSON.parse(cuerpo) as { data: Dispensacion }, { status: 201 });
  }),

  http.post(api('/dispensaciones/:id/autorizar'), ({ request, params }) => {
    const u = autorizar(request, 'dispensacion.autorizar');
    if (u instanceof Response) return u;
    const d = buscarDispensacion(params.id);
    if (!d) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
    const bloqueo = exigirAutorizable(d, u, 'autorizar');
    if (bloqueo) return bloqueo;
    if (!BODEGAS.some((b) => b.id === d.bodega_id && b.activa)) {
      return validacion({ bodega_id: ['La bodega no existe o está inactiva.'] });
    }
    const s: SolicitudDispensacion = {
      paciente_id: d.paciente_id,
      prescripcion_id: d.prescripcion_id,
      bodega_id: d.bodega_id,
      items: d.items.map((i) => ({
        prescripcion_item_id: i.prescripcion_item_id,
        cantidad: i.cantidad,
      })),
    };
    const prescripcion = PRESCRIPCIONES.find((p) => p.id === d.prescripcion_id);
    if (
      !prescripcion ||
      prescripcion.estado !== 'ACTIVA' ||
      prescripcion.fecha_vencimiento < hoyISO()
    ) {
      return errorApi(422, 'PRESCRIPCION_NO_VIGENTE', 'La prescripción no está vigente.', {
        prescripcion_id: d.prescripcion_id,
      });
    }
    const asignacion = asignarTodos(s, new Map(prescripcion.items.map((i) => [i.id, i])));
    if (asignacion instanceof Response) return asignacion;
    d.detalles = descontar(d, asignacion, u);
    d.estado = 'CONFIRMADA';
    d.autorizado_por_id = u.id;
    d.autorizado_en = marcaEnBogota();
    return HttpResponse.json({ data: d });
  }),

  http.post(api('/dispensaciones/:id/rechazar'), async ({ request, params }) => {
    const u = autorizar(request, 'dispensacion.autorizar');
    if (u instanceof Response) return u;
    const d = buscarDispensacion(params.id);
    if (!d) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
    const bloqueo = exigirAutorizable(d, u, 'rechazar');
    if (bloqueo) return bloqueo;
    const cuerpo = (await leerJson(request)) as { motivo?: unknown } | null;
    const motivo = typeof cuerpo?.motivo === 'string' ? cuerpo.motivo.trim() : '';
    if (motivo.length < 10 || motivo.length > 500 || /[\r\n]/.test(motivo)) {
      return validacion({ motivo: ['The motivo field must be at least 10 characters.'] });
    }
    d.estado = 'RECHAZADA';
    d.rechazado_por_id = u.id;
    d.rechazado_en = marcaEnBogota();
    d.motivo_rechazo = motivo;
    return HttpResponse.json({ data: d });
  }),

  http.get(api('/dispensaciones/:id'), ({ request, params }) => {
    // 401 → 404 → 403 (§1.8). Policy: auxiliar, regente y auditor; admin y médico 403.
    const u = autorizar(request);
    if (u instanceof Response) return u;
    const d = buscarDispensacion(params.id);
    if (!d) return errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');
    if (!ROLES_CONSULTA.includes(u.rol)) return prohibido();
    const p = PACIENTES.find((x) => x.id === d.paciente_id);
    return HttpResponse.json({ data: { ...d, ...(p ? { paciente: verPaciente(p, u) } : {}) } });
  }),
];

export const handlersFaltantes: HttpHandler[] = [
  // Contrato v0.13.0: paginado, created_at ascendente (desempate id), sin paciente ni detalles.
  // Errores 401 → 403 (antes que la validación) → 422; vacío es 422; bodega inexistente, 200 vacío.
  http.get(api('/dispensaciones'), ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    if (!ROLES_CONSULTA.includes(u.rol)) return prohibido();
    const q = new URL(request.url).searchParams;
    const estado = q.get('estado');
    const bodegaCruda = q.get('bodega_id');
    const bodega = filtroNum(request, 'bodega_id');
    const campos: Record<string, string[]> = {};
    if (estado !== null && !ESTADOS.includes(estado as EstadoDispensacion))
      campos.estado = ['The selected estado is invalid.'];
    if (bodegaCruda !== null && (bodega === undefined || !esId(bodega)))
      campos.bodega_id = ['The bodega id field must be an integer.'];
    const porPagina = q.get('por_pagina');
    if (porPagina !== null && !/^(100|[1-9]\d?)$/.test(porPagina))
      campos.por_pagina = ['The por pagina field must be between 1 and 100.'];
    const pagina = q.get('page');
    if (pagina !== null && !/^(1000000|[1-9]\d{0,5})$/.test(pagina))
      campos.page = ['The page field must be between 1 and 1000000.'];
    if (Object.keys(campos).length) return validacion(campos);
    const filas = DISPENSACIONES.filter(
      (d) => (!estado || d.estado === estado) && (bodega === undefined || d.bodega_id === bodega),
    )
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
      .map(filaListado);
    return HttpResponse.json(paginar(filas, request));
  }),
];
