// Traslados (existen en el backend): máquina de estados completa en memoria (RN-07, RN-08)
import { http, HttpResponse, type HttpHandler } from 'msw';
import type {
  Discrepancia,
  EstadoTraslado,
  Existencia,
  TipoResolucion,
  Traslado,
  TrasladoItem,
  Usuario,
} from '../../api/tipos';
import { diasHastaVencer } from '../../lib/fechas';
import { BODEGAS, EXISTENCIAS, LOTES, PRODUCTOS, TRASLADOS } from '../datos';
import { api, autorizar, errorApi, filtroNum, paginar } from '../utilidades';

// Copias iniciales para reiniciar el estado entre tests del mismo archivo
const TRASLADOS_INICIALES = structuredClone(TRASLADOS);
const EXISTENCIAS_INICIALES = structuredClone(EXISTENCIAS);

/** Restaura TRASLADOS y EXISTENCIAS a la semilla. */
export function reiniciarTraslados(): void {
  TRASLADOS.splice(0, TRASLADOS.length, ...structuredClone(TRASLADOS_INICIALES));
  EXISTENCIAS.splice(0, EXISTENCIAS.length, ...structuredClone(EXISTENCIAS_INICIALES));
}

const ITEMS_MAXIMO = 50;
const CANTIDAD_MAXIMA = 1_000_000;
const MOTIVO_MIN = 10;
const MOTIVO_MAX_ANULAR = 500;
const MOTIVO_MAX_DISCREPANCIA = 400;
const TIPOS_RESOLUCION: TipoResolucion[] = ['PERDIDA', 'REINTEGRO_ORIGEN', 'ENTREGA_DESTINO'];

type Cuerpo = Record<string, unknown>;
type Accion = 'solicitar' | 'aprobar' | 'despachar' | 'recibir' | 'anular' | 'editar_items';

const ACCIONES_POR_ESTADO: Record<EstadoTraslado, Accion[]> = {
  BORRADOR: ['solicitar', 'anular', 'editar_items'],
  SOLICITADO: ['aprobar', 'anular'],
  APROBADO: ['despachar', 'anular'],
  EN_TRANSITO: ['recibir'],
  RECIBIDO: [],
  RECIBIDO_PARCIAL: [],
  ANULADO: [],
};

const ahora = () => new Date().toISOString();
const esEntero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const siguienteId = (ids: number[]) => ids.reduce((m, x) => Math.max(m, x), 0) + 1;

async function leerCuerpo(request: Request): Promise<Cuerpo> {
  const c = (await request.json().catch(() => null)) as unknown;
  return c && typeof c === 'object' && !Array.isArray(c) ? (c as Cuerpo) : {};
}

const validacion = (campos: Record<string, string[]>) =>
  errorApi(422, 'VALIDACION', 'Los datos no son válidos.', { campos });

const noAutorizado = () =>
  errorApi(403, 'NO_AUTORIZADO', 'No tiene permiso para realizar esta acción.');

const transicionInvalida = (t: Traslado, accion: Accion) =>
  errorApi(409, 'TRANSICION_INVALIDA', 'Transición inválida.', {
    traslado_id: t.id,
    estado: t.estado,
    accion,
  });

const segregacion = (trasladoId: number, accion: 'aprobar' | 'resolver_discrepancia') =>
  errorApi(403, 'SEGREGACION_FUNCIONES', 'Segregación de funciones.', {
    traslado_id: trasladoId,
    accion,
  });

const tiene = (u: Usuario, h: Usuario['habilidades'][number]) => u.habilidades.includes(h);

function buscar(id: unknown): Traslado | undefined {
  return TRASLADOS.find((x) => x.id === Number(id));
}

const noEncontrado = () => errorApi(404, 'NO_ENCONTRADO', 'Recurso no encontrado.');

function bodegaResumen(id: number) {
  const b = BODEGAS.find((x) => x.id === id);
  return b ? { id: b.id, codigo: b.codigo, nombre: b.nombre } : null;
}

function estaVencido(fecha: string): boolean {
  return diasHastaVencer(fecha) <= 0;
}

/** Valida los ítems (forma + lote del producto + vencido). Devuelve los ítems o la respuesta. */
function validarItems(items: unknown): TrasladoItem[] | Response {
  const campos: Record<string, string[]> = {};
  if (!Array.isArray(items) || items.length < 1) {
    return validacion({ items: ['The items field must have at least 1 items.'] });
  }
  if (items.length > ITEMS_MAXIMO) {
    return validacion({
      items: [`The items field must not have more than ${ITEMS_MAXIMO} items.`],
    });
  }
  const vistos = new Set<number>();
  let siguiente = siguienteId(TRASLADOS.flatMap((t) => t.items.map((i) => i.id)));
  const salida: TrasladoItem[] = [];
  for (const [i, bruto] of items.entries()) {
    const it = (bruto ?? {}) as Cuerpo;
    const producto = PRODUCTOS.find((p) => p.id === it.producto_id);
    const lote = LOTES.find((l) => l.id === it.lote_id);
    if (!esEntero(it.producto_id) || !producto)
      campos[`items.${i}.producto_id`] = ['The selected producto id is invalid.'];
    if (!esEntero(it.lote_id) || !lote)
      campos[`items.${i}.lote_id`] = ['The selected lote id is invalid.'];
    else if (vistos.has(it.lote_id))
      campos[`items.${i}.lote_id`] = ['The lote id field has a duplicate value.'];
    else if (producto && lote.producto_id !== producto.id)
      campos[`items.${i}.lote_id`] = ['The selected lote id is invalid.'];
    if (!esEntero(it.cantidad)) campos[`items.${i}.cantidad`] = ['must be an integer.'];
    else if (it.cantidad < 1) campos[`items.${i}.cantidad`] = ['must be at least 1.'];
    else if (it.cantidad > CANTIDAD_MAXIMA)
      campos[`items.${i}.cantidad`] = [`must not be greater than ${CANTIDAD_MAXIMA}.`];
    if (esEntero(it.lote_id)) vistos.add(it.lote_id);
    if (producto && lote && esEntero(it.cantidad)) {
      salida.push({
        id: siguiente++,
        producto_id: producto.id,
        producto: { id: producto.id, codigo: producto.codigo, nombre: producto.nombre },
        lote_id: lote.id,
        lote: { id: lote.id, codigo: lote.codigo, fecha_vencimiento: lote.fecha_vencimiento },
        cantidad: it.cantidad,
        cantidad_recibida: null,
        discrepancia: null,
      });
    }
  }
  if (Object.keys(campos).length) return validacion(campos);
  const vencido = salida.find((it) => estaVencido(it.lote.fecha_vencimiento));
  if (vencido) {
    return errorApi(422, 'LOTE_VENCIDO', 'Lote vencido.', {
      lote_id: vencido.lote_id,
      lote_codigo: vencido.lote.codigo,
      producto_id: vencido.producto_id,
      fecha_vencimiento: vencido.lote.fecha_vencimiento,
    });
  }
  return salida;
}

/** Existencia de un lote en una bodega; la crea en 0 si no existe y `crear`. */
function existencia(bodegaId: number, item: TrasladoItem, crear: boolean): Existencia | undefined {
  const e = EXISTENCIAS.find((x) => x.bodega_id === bodegaId && x.lote_id === item.lote_id);
  if (e || !crear) return e;
  const bodega = bodegaResumen(bodegaId);
  if (!bodega) return undefined;
  const nueva: Existencia = {
    id: siguienteId(EXISTENCIAS.map((x) => x.id)),
    bodega_id: bodegaId,
    producto_id: item.producto_id,
    lote_id: item.lote_id,
    bodega,
    producto: item.producto,
    lote: item.lote,
    fecha_vencimiento: item.lote.fecha_vencimiento,
    cantidad: 0,
    vencido: estaVencido(item.lote.fecha_vencimiento),
  };
  EXISTENCIAS.push(nueva);
  return nueva;
}

function actualizar(t: Traslado, cambios: Partial<Traslado>) {
  Object.assign(t, cambios, { updated_at: ahora() });
  return HttpResponse.json({ data: t });
}

export const handlersReales: HttpHandler[] = [
  http.get(api('/traslados'), ({ request }) => {
    const u = autorizar(request, 'traslado.consultar');
    if (u instanceof Response) return u;
    const estado = new URL(request.url).searchParams.get('estado');
    const bodega = filtroNum(request, 'bodega_id');
    const origen = filtroNum(request, 'bodega_origen_id');
    const destino = filtroNum(request, 'bodega_destino_id');
    const filas = TRASLADOS.filter(
      (t) =>
        (!estado || t.estado === estado) &&
        (bodega === undefined || t.bodega_origen_id === bodega || t.bodega_destino_id === bodega) &&
        (origen === undefined || t.bodega_origen_id === origen) &&
        (destino === undefined || t.bodega_destino_id === destino),
    ).toSorted((a, b) => b.id - a.id);
    return HttpResponse.json(paginar(filas, request));
  }),

  http.get(api('/traslados/:id'), ({ request, params }) => {
    const u = autorizar(request, 'traslado.consultar');
    if (u instanceof Response) return u;
    const t = buscar(params.id);
    if (!t) return noEncontrado();
    return HttpResponse.json({ data: t });
  }),

  http.post(api('/traslados'), async ({ request }) => {
    const u = autorizar(request, 'traslado.operar');
    if (u instanceof Response) return u;
    const c = await leerCuerpo(request);
    const campos: Record<string, string[]> = {};
    const origen = esEntero(c.bodega_origen_id) ? bodegaResumen(c.bodega_origen_id) : null;
    const destino = esEntero(c.bodega_destino_id) ? bodegaResumen(c.bodega_destino_id) : null;
    if (!origen) campos.bodega_origen_id = ['The selected bodega origen id is invalid.'];
    if (!destino) campos.bodega_destino_id = ['The selected bodega destino id is invalid.'];
    else if (origen && origen.id === destino.id)
      campos.bodega_destino_id = [
        'The bodega destino id field and bodega origen id must be different.',
      ];
    if (
      c.observaciones !== undefined &&
      c.observaciones !== null &&
      typeof c.observaciones !== 'string'
    )
      campos.observaciones = ['The observaciones field must be a string.'];
    if (Object.keys(campos).length || !origen || !destino) return validacion(campos);
    const items = validarItems(c.items);
    if (items instanceof Response) return items;
    const marca = ahora();
    const t: Traslado = {
      id: siguienteId(TRASLADOS.map((x) => x.id)),
      estado: 'BORRADOR',
      bodega_origen_id: origen.id,
      bodega_destino_id: destino.id,
      bodega_origen: origen,
      bodega_destino: destino,
      observaciones:
        typeof c.observaciones === 'string' && c.observaciones.trim()
          ? c.observaciones.trim()
          : null,
      creado_por_id: u.id,
      solicitado_por_id: null,
      solicitado_en: null,
      aprobado_por_id: null,
      aprobado_en: null,
      despachado_por_id: null,
      despachado_en: null,
      recibido_por_id: null,
      recibido_en: null,
      anulado_por_id: null,
      anulado_en: null,
      motivo_anulacion: null,
      items,
      discrepancias: [],
      created_at: marca,
      updated_at: marca,
    };
    TRASLADOS.push(t);
    return HttpResponse.json({ data: t }, { status: 201 });
  }),

  http.put(api('/traslados/:id/items'), async ({ request, params }) => {
    const u = autorizar(request, 'traslado.operar');
    if (u instanceof Response) return u;
    const t = buscar(params.id);
    if (!t) return noEncontrado();
    if (t.creado_por_id !== u.id) return noAutorizado();
    const c = await leerCuerpo(request);
    const items = validarItems(c.items);
    if (items instanceof Response) return items;
    if (t.estado !== 'BORRADOR') return transicionInvalida(t, 'editar_items');
    return actualizar(t, { items });
  }),

  http.post(api('/traslados/:id/solicitar'), ({ request, params }) => {
    const u = autorizar(request, 'traslado.operar');
    if (u instanceof Response) return u;
    const t = buscar(params.id);
    if (!t) return noEncontrado();
    if (t.creado_por_id !== u.id) return noAutorizado();
    if (t.estado !== 'BORRADOR') return transicionInvalida(t, 'solicitar');
    return actualizar(t, { estado: 'SOLICITADO', solicitado_por_id: u.id, solicitado_en: ahora() });
  }),

  http.post(api('/traslados/:id/aprobar'), ({ request, params }) => {
    const u = autorizar(request, 'traslado.aprobar');
    if (u instanceof Response) return u;
    const t = buscar(params.id);
    if (!t) return noEncontrado();
    if (t.solicitado_por_id === u.id) return segregacion(t.id, 'aprobar');
    if (t.estado !== 'SOLICITADO') return transicionInvalida(t, 'aprobar');
    return actualizar(t, { estado: 'APROBADO', aprobado_por_id: u.id, aprobado_en: ahora() });
  }),

  http.post(api('/traslados/:id/despachar'), ({ request, params }) => {
    const u = autorizar(request, 'traslado.operar');
    if (u instanceof Response) return u;
    const t = buscar(params.id);
    if (!t) return noEncontrado();
    if (t.estado !== 'APROBADO') return transicionInvalida(t, 'despachar');
    // Primero se valida todo; luego se descuenta (todo o nada)
    for (const it of t.items) {
      if (estaVencido(it.lote.fecha_vencimiento)) {
        return errorApi(422, 'LOTE_VENCIDO', 'Lote vencido.', {
          lote_id: it.lote_id,
          lote_codigo: it.lote.codigo,
          producto_id: it.producto_id,
          fecha_vencimiento: it.lote.fecha_vencimiento,
        });
      }
      const e = existencia(t.bodega_origen_id, it, false);
      const disponible = e?.cantidad ?? 0;
      if (disponible < it.cantidad) {
        return errorApi(409, 'STOCK_INSUFICIENTE', 'Stock insuficiente.', {
          traslado_item_id: it.id,
          lote_id: it.lote_id,
          existencia_id: e?.id ?? null,
          disponible,
          solicitado: it.cantidad,
        });
      }
    }
    for (const it of t.items) {
      const e = existencia(t.bodega_origen_id, it, false);
      if (e) e.cantidad -= it.cantidad;
    }
    return actualizar(t, {
      estado: 'EN_TRANSITO',
      despachado_por_id: u.id,
      despachado_en: ahora(),
    });
  }),

  http.post(api('/traslados/:id/recibir'), async ({ request, params }) => {
    const u = autorizar(request, 'traslado.operar');
    if (u instanceof Response) return u;
    const t = buscar(params.id);
    if (!t) return noEncontrado();
    const c = await leerCuerpo(request);
    const filas = Array.isArray(c.items) ? (c.items as Cuerpo[]) : null;
    const campos: Record<string, string[]> = {};
    if (!filas || filas.length < 1) campos.items = ['The items field is required.'];
    const recibidas = new Map<number, number>();
    filas?.forEach((f, i) => {
      if (!esEntero(f.traslado_item_id) || !t.items.some((it) => it.id === f.traslado_item_id))
        campos[`items.${i}.traslado_item_id`] = ['The selected traslado item id is invalid.'];
      else if (recibidas.has(f.traslado_item_id))
        campos[`items.${i}.traslado_item_id`] = [
          'The traslado item id field has a duplicate value.',
        ];
      if (!esEntero(f.cantidad_recibida))
        campos[`items.${i}.cantidad_recibida`] = ['must be an integer.'];
      else if (f.cantidad_recibida < 0)
        campos[`items.${i}.cantidad_recibida`] = ['must be at least 0.'];
      if (esEntero(f.traslado_item_id) && esEntero(f.cantidad_recibida))
        recibidas.set(f.traslado_item_id, f.cantidad_recibida);
    });
    if (!Object.keys(campos).length && recibidas.size !== t.items.length)
      campos.items = ['Debe incluir todos los ítems del traslado.'];
    if (Object.keys(campos).length) return validacion(campos);
    if (t.estado !== 'EN_TRANSITO') return transicionInvalida(t, 'recibir');
    for (const it of t.items) {
      const r = recibidas.get(it.id) ?? 0;
      if (r > it.cantidad) {
        return errorApi(422, 'CANTIDAD_RECIBIDA_EXCEDE', 'Cantidad recibida excede.', {
          traslado_item_id: it.id,
          despachada: it.cantidad,
          recibida: r,
        });
      }
    }
    const marca = ahora();
    let siguienteDisc = siguienteId(TRASLADOS.flatMap((x) => x.discrepancias.map((d) => d.id)));
    for (const it of t.items) {
      const r = recibidas.get(it.id) ?? 0;
      it.cantidad_recibida = r;
      if (r > 0) {
        const e = existencia(t.bodega_destino_id, it, true);
        if (e) e.cantidad += r;
      }
      if (r < it.cantidad) {
        const d: Discrepancia = {
          id: siguienteDisc++,
          traslado_item_id: it.id,
          traslado_id: t.id,
          producto_id: it.producto_id,
          lote_id: it.lote_id,
          cantidad: it.cantidad - r,
          estado: 'PENDIENTE',
          tipo_resolucion: null,
          motivo: null,
          resuelto_por_id: null,
          resuelto_en: null,
          movimiento_kardex_id: null,
          created_at: marca,
        };
        it.discrepancia = d;
        t.discrepancias.push(d);
      }
    }
    const completa = t.items.every((it) => it.cantidad_recibida === it.cantidad);
    return actualizar(t, {
      estado: completa ? 'RECIBIDO' : 'RECIBIDO_PARCIAL',
      recibido_por_id: u.id,
      recibido_en: marca,
    });
  }),

  http.post(api('/traslados/:id/anular'), async ({ request, params }) => {
    const u = autorizar(request, 'traslado.anular');
    if (u instanceof Response) return u;
    const t = buscar(params.id);
    if (!t) return noEncontrado();
    if (t.creado_por_id !== u.id && !tiene(u, 'traslado.aprobar')) return noAutorizado();
    const c = await leerCuerpo(request);
    const motivo = typeof c.motivo === 'string' ? c.motivo.trim() : '';
    if (motivo.length < MOTIVO_MIN)
      return validacion({
        motivo: [`The motivo field must be at least ${MOTIVO_MIN} characters.`],
      });
    if (motivo.length > MOTIVO_MAX_ANULAR)
      return validacion({
        motivo: [`The motivo field must not be greater than ${MOTIVO_MAX_ANULAR} characters.`],
      });
    if (/[\r\n]/.test(motivo))
      return validacion({ motivo: ['The motivo field format is invalid.'] });
    if (!ACCIONES_POR_ESTADO[t.estado].includes('anular')) return transicionInvalida(t, 'anular');
    return actualizar(t, {
      estado: 'ANULADO',
      anulado_por_id: u.id,
      anulado_en: ahora(),
      motivo_anulacion: motivo,
    });
  }),

  http.post(api('/discrepancias/:id/resolver'), async ({ request, params }) => {
    const u = autorizar(request, 'traslado.aprobar');
    if (u instanceof Response) return u;
    const id = Number(params.id);
    const t = TRASLADOS.find((x) => x.discrepancias.some((d) => d.id === id));
    const d = t?.discrepancias.find((x) => x.id === id);
    if (!t || !d) return noEncontrado();
    if (t.solicitado_por_id === u.id) return segregacion(t.id, 'resolver_discrepancia');
    const c = await leerCuerpo(request);
    const campos: Record<string, string[]> = {};
    const tipo = TIPOS_RESOLUCION.find((x) => x === c.tipo);
    if (!tipo) campos.tipo = ['The selected tipo is invalid.'];
    const motivo = typeof c.motivo === 'string' ? c.motivo.trim() : '';
    if (motivo.length < MOTIVO_MIN)
      campos.motivo = [`The motivo field must be at least ${MOTIVO_MIN} characters.`];
    else if (motivo.length > MOTIVO_MAX_DISCREPANCIA)
      campos.motivo = [
        `The motivo field must not be greater than ${MOTIVO_MAX_DISCREPANCIA} characters.`,
      ];
    else if (/[\r\n]/.test(motivo)) campos.motivo = ['The motivo field format is invalid.'];
    if (Object.keys(campos).length || !tipo) return validacion(campos);
    if (d.estado !== 'PENDIENTE') {
      return errorApi(409, 'TRANSICION_INVALIDA', 'Transición inválida.', {
        discrepancia_id: d.id,
        estado: d.estado,
        accion: 'resolver',
      });
    }
    const item = t.items.find((it) => it.id === d.traslado_item_id);
    if (item && tipo !== 'PERDIDA') {
      const bodega = tipo === 'REINTEGRO_ORIGEN' ? t.bodega_origen_id : t.bodega_destino_id;
      const e = existencia(bodega, item, true);
      if (e) e.cantidad += d.cantidad;
    }
    Object.assign(d, {
      estado: 'RESUELTA',
      tipo_resolucion: tipo,
      motivo,
      resuelto_por_id: u.id,
      resuelto_en: ahora(),
    } satisfies Partial<Discrepancia>);
    if (item) item.discrepancia = d;
    t.updated_at = ahora();
    return HttpResponse.json({ data: d });
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
