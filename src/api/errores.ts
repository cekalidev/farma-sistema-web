// Traducción de errores de la API a mensajes claros en español
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, esApiError, type Detalles } from './client';

const num = (d: Detalles, k: string): number | undefined =>
  typeof d[k] === 'number' ? d[k] : undefined;
const txt = (d: Detalles, k: string): string | undefined =>
  typeof d[k] === 'string' ? d[k] : undefined;

const ESTADOS: Record<string, string> = {
  BORRADOR: 'borrador',
  SOLICITADO: 'solicitado',
  APROBADO: 'aprobado',
  EN_TRANSITO: 'en tránsito',
  RECIBIDO: 'recibido',
  RECIBIDO_PARCIAL: 'recibido parcial',
  ANULADO: 'anulado',
  CONFIRMADA: 'confirmada',
  PENDIENTE_AUTORIZACION: 'pendiente de autorización',
  RECHAZADA: 'rechazada',
  PENDIENTE: 'pendiente',
  RESUELTA: 'resuelta',
  ACTIVA: 'activa',
  ANULADA: 'anulada',
};

const ACCIONES: Record<string, string> = {
  solicitar: 'solicitar',
  aprobar: 'aprobar',
  despachar: 'despachar',
  recibir: 'recibir',
  anular: 'anular',
  editar: 'editar',
  editar_items: 'editar los ítems',
  autorizar: 'autorizar',
  rechazar: 'rechazar',
  resolver: 'resolver la discrepancia',
  resolver_discrepancia: 'resolver la discrepancia',
};

/** Solo se muestra un código con forma de constante (nunca texto libre del backend). */
const CODIGO_SEGURO = /^[A-Z][A-Z0-9_]{0,59}$/;

/**
 * true si no se sabe si la operación se aplicó en el servidor: sin respuesta (RED)
 * o 5xx (500, 502/504 del proxy). Antes de reintentar hay que consultar el estado.
 */
export function esResultadoIncierto(e: unknown): boolean {
  return esApiError(e) && (e.codigo === 'RED' || e.status >= 500);
}

function fechaLegible(f: string | undefined): string {
  if (!f) return '';
  const [a, m, d] = f.split('-');
  return a && m && d ? `${d}/${m}/${a}` : f;
}

function stockInsuficiente(d: Detalles): string {
  const solicitado = num(d, 'solicitado');
  const disponible = num(d, 'disponible');
  const vencido = num(d, 'vencido_no_dispensable');
  let base = 'Stock insuficiente';
  if (d.traslado_item_id !== undefined) base = 'Stock insuficiente en la bodega de origen';
  else if (d.existencia_id !== undefined && vencido === undefined)
    base = 'Stock insuficiente en la existencia';
  const partes: string[] = [];
  if (solicitado !== undefined) partes.push(`solicitado ${solicitado}`);
  if (disponible !== undefined) partes.push(`disponible ${disponible}`);
  let msg = partes.length ? `${base}: ${partes.join(', ')}.` : `${base}.`;
  if (vencido !== undefined && vencido > 0) {
    msg += ` Hay ${vencido} unidad(es) vencidas o que vencen hoy que no se pueden dispensar.`;
  }
  return msg;
}

/** Mensaje claro en español para cualquier error (ApiError o desconocido). */
export function mensajeDeError(e: unknown): string {
  if (!esApiError(e)) {
    return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
  const d = e.detalles;
  switch (e.codigo) {
    case 'STOCK_INSUFICIENTE':
      return stockInsuficiente(d);
    case 'LOTE_VENCIDO': {
      const lote = txt(d, 'lote_codigo');
      const fecha = fechaLegible(txt(d, 'fecha_vencimiento'));
      return `El lote${lote ? ` ${lote}` : ''} está vencido${fecha ? ` (venció el ${fecha})` : ''} y no puede moverse.`;
    }
    case 'LOTE_NO_COINCIDE': {
      const lote = txt(d, 'lote_codigo');
      const reg = fechaLegible(txt(d, 'fecha_registrada'));
      return `El lote${lote ? ` ${lote}` : ''} ya existe con otra fecha de vencimiento${reg ? ` (${reg})` : ''}.`;
    }
    case 'PRESCRIPCION_NO_VIGENTE':
      return 'La prescripción no está vigente (anulada o vencida).';
    case 'PRESCRIPCION_NO_CORRESPONDE':
      return 'La prescripción no corresponde al paciente o los ítems no son de esa prescripción.';
    case 'CANTIDAD_EXCEDE_PRESCRITO': {
      const pendiente = num(d, 'pendiente');
      const solicitado = num(d, 'solicitado');
      if (pendiente !== undefined && solicitado !== undefined) {
        return `La cantidad solicitada (${solicitado}) supera lo pendiente por dispensar (${pendiente}).`;
      }
      return 'La cantidad supera lo pendiente por dispensar de la prescripción.';
    }
    case 'CANTIDAD_EXCEDE_MAXIMO': {
      const maximo = num(d, 'maximo');
      return `La cantidad supera el saldo máximo admitido para la existencia${maximo !== undefined ? ` (${maximo})` : ''}.`;
    }
    case 'CANTIDAD_RECIBIDA_EXCEDE': {
      const desp = num(d, 'despachada');
      const rec = num(d, 'recibida');
      if (desp !== undefined && rec !== undefined) {
        return `La cantidad recibida (${rec}) no puede superar la despachada (${desp}).`;
      }
      return 'La cantidad recibida no puede superar la despachada.';
    }
    case 'IDEMPOTENCY_KEY_REQUERIDA':
      return 'Falta la clave de idempotencia de la operación. Recarga la pantalla e intenta de nuevo.';
    case 'IDEMPOTENCY_KEY_REUTILIZADA':
      return 'Esta operación ya se envió con otros datos. Revisa el formulario y vuelve a confirmar.';
    case 'TRANSICION_INVALIDA': {
      const estado = txt(d, 'estado');
      const accion = txt(d, 'accion');
      if (estado && accion) {
        return `No se puede ${ACCIONES[accion] ?? accion} porque el documento está en estado ${ESTADOS[estado] ?? estado}. Actualiza para ver su estado actual.`;
      }
      return 'La acción no es válida en el estado actual. Actualiza para ver su estado actual.';
    }
    case 'AUTORIZACION_MISMO_USUARIO':
      return 'Quien registró la dispensación no puede autorizarla ni rechazarla. Debe hacerlo otro regente.';
    case 'SEGREGACION_FUNCIONES':
      return txt(d, 'accion') === 'resolver_discrepancia'
        ? 'Debe resolverla otro regente distinto de quien solicitó el traslado.'
        : 'Quien solicitó el traslado no puede aprobarlo. Debe hacerlo otro regente.';
    case 'CONFLICTO_CONCURRENCIA':
      return 'La operación coincidió con otra simultánea y no se aplicó. Intenta de nuevo.';
    case 'CODIGO_DUPLICADO':
      return 'Ya existe un registro con ese valor.';
    case 'NO_AUTORIZADO':
      return 'No tienes permiso para realizar esta acción.';
    case 'NO_ENCONTRADO':
      return 'El recurso solicitado no existe o ya no está disponible.';
    case 'NO_AUTENTICADO':
      return 'Tu sesión expiró. Inicia sesión de nuevo.';
    case 'CREDENCIALES_INVALIDAS':
      return 'Correo o contraseña incorrectos.';
    case 'DEMASIADAS_SOLICITUDES':
      return e.retryAfterSeg !== undefined
        ? `Demasiados intentos. Espera ${e.retryAfterSeg} segundo(s) e intenta de nuevo.`
        : 'Demasiados intentos. Espera un momento e intenta de nuevo.';
    case 'METODO_NO_PERMITIDO':
      return 'Operación no permitida.';
    case 'DATO_INVALIDO':
      return 'Uno de los valores enviados no tiene un formato válido.';
    case 'VALIDACION': {
      const campos = erroresDeCampos(e);
      const primeros = Object.entries(campos).slice(0, 3);
      if (primeros.length === 0) return 'Los datos enviados no son válidos.';
      const lista = primeros.map(([c, m]) => `${etiquetaCampo(c)}: ${m.replace(/\.$/, '')}`);
      return `Revisa los datos: ${lista.join('; ')}.`;
    }
    case 'RED':
      return 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.';
    case 'ERROR_INTERNO':
      return 'Error interno del servidor. Intenta de nuevo en unos minutos.';
    default:
      // Nunca el `mensaje` crudo: puede venir en inglés o con datos personales (RN-10)
      return CODIGO_SEGURO.test(e.codigo)
        ? `La solicitud no pudo procesarse (código ${e.codigo}). Intenta de nuevo o avisa a soporte.`
        : 'La solicitud no pudo procesarse. Intenta de nuevo o avisa a soporte.';
  }
}

// ---------- Errores de campos (422 VALIDACION) ----------

const ETIQUETAS: Record<string, string> = {
  email: 'correo',
  password: 'contraseña',
  bodega_id: 'bodega',
  bodega_origen_id: 'bodega de origen',
  bodega_destino_id: 'bodega de destino',
  producto_id: 'producto',
  lote_id: 'lote',
  paciente_id: 'paciente',
  prescripcion_id: 'prescripción',
  prescripcion_item_id: 'ítem de prescripción',
  traslado_item_id: 'ítem de traslado',
  cantidad: 'cantidad',
  cantidad_recibida: 'cantidad recibida',
  motivo: 'motivo',
  observaciones: 'observaciones',
  items: 'ítems',
  tipo: 'tipo',
  fecha_vencimiento: 'fecha de vencimiento',
  codigo: 'código',
};

/** `items.0.cantidad` → `cantidad (ítem 1)`. */
export function etiquetaCampo(clave: string): string {
  const partes = clave.split('.');
  const ultima = partes.filter((p) => !/^\d+$/.test(p)).pop() ?? clave;
  const indice = partes.find((p) => /^\d+$/.test(p));
  const base = ETIQUETAS[ultima] ?? ultima.replace(/_/g, ' ');
  return indice !== undefined ? `${base} (ítem ${Number(indice) + 1})` : base;
}

// Patrones conocidos de mensajes de Laravel (en inglés) → español
const PATRONES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/field is required/i, () => 'Es obligatorio.'],
  [/must be an integer/i, () => 'Debe ser un número entero.'],
  [/must be a number|must be numeric/i, () => 'Debe ser un número.'],
  [/must be at least (\d+) characters/i, (m) => `Debe tener al menos ${m[1]} caracteres.`],
  [/must not be greater than (\d+) characters/i, (m) => `No puede superar ${m[1]} caracteres.`],
  [/must be at least (-?\d+)/i, (m) => `Debe ser mayor o igual a ${m[1]}.`],
  [/must not be greater than (-?\d+)/i, (m) => `Debe ser menor o igual a ${m[1]}.`],
  [/must have at least (\d+) items?/i, (m) => `Debe tener al menos ${m[1]} ítem(s).`],
  [/must not have more than (\d+) items?/i, (m) => `No puede tener más de ${m[1]} ítems.`],
  [/format is invalid/i, () => 'El formato no es válido.'],
  [/selected .* is invalid|is invalid/i, () => 'El valor seleccionado no es válido.'],
  [/must be a valid email/i, () => 'Debe ser un correo válido.'],
  [
    /must be a valid date|does not match the format/i,
    () => 'Debe ser una fecha válida (AAAA-MM-DD).',
  ],
  [/must be an array/i, () => 'Formato inválido.'],
  [/must be a string/i, () => 'Debe ser texto.'],
  [/must be different|must not be the same|different from/i, () => 'Debe ser distinto.'],
  [/has already been taken/i, () => 'Ya está registrado.'],
  [/has a duplicate value|duplicate/i, () => 'Está repetido.'],
  [/must be after/i, () => 'La fecha debe ser posterior.'],
  [/must not contain|line break/i, () => 'No puede contener saltos de línea.'],
  // Mensajes ya en español: solo patrones conocidos, nunca el texto tal cual
  [/obligatori/i, () => 'Es obligatorio.'],
  [/n[uú]mero entero/i, () => 'Debe ser un número entero.'],
  [/ya (est[aá] registrad|existe)/i, () => 'Ya está registrado.'],
];

function traducir(mensaje: string): string {
  for (const [re, fn] of PATRONES) {
    const m = mensaje.match(re);
    if (m) return fn(m);
  }
  // Desconocido (en cualquier idioma): genérico seguro, sin eco del texto del backend
  return 'El valor no es válido.';
}

/** Errores por campo desde `detalles.campos` (claves con punto) ya traducidos. */
export function erroresDeCampos(e: unknown): Record<string, string> {
  if (!esApiError(e) || !e.campos) return {};
  const salida: Record<string, string> = {};
  for (const [clave, mensajes] of Object.entries(e.campos)) {
    const primero = Array.isArray(mensajes) ? mensajes[0] : mensajes;
    salida[clave] = typeof primero === 'string' ? traducir(primero) : 'El valor no es válido.';
  }
  return salida;
}

/** Clave del backend (`items.0.cantidad`) → mensaje ya traducido. */
export type ErroresNoAplicados = Record<string, string>;

/**
 * Campos que pinta el formulario:
 * - lista de nombres (la clave del backend es igual al nombre del campo);
 * - mapeo `clave del backend → campo del formulario` (solo se aplican las claves del mapeo);
 * - función que devuelve el campo o null si no se pinta.
 */
export type CamposVisibles<T extends FieldValues> =
  | readonly Path<T>[]
  | Readonly<Record<string, Path<T>>>
  | ((claveBackend: string) => Path<T> | null | undefined);

function resolverCampo<T extends FieldValues>(
  campos: CamposVisibles<T>,
  clave: string,
): Path<T> | null {
  if (typeof campos === 'function') return campos(clave) ?? null;
  if (Array.isArray(campos)) {
    return (campos as readonly string[]).includes(clave) ? (clave as Path<T>) : null;
  }
  const mapa = campos as Readonly<Record<string, Path<T>>>;
  return Object.hasOwn(mapa, clave) ? (mapa[clave] ?? null) : null;
}

/**
 * Aplica los errores de campo (422 VALIDACION) SOLO a los campos que existen en el
 * formulario y DEVUELVE los que no pudo aplicar, para mostrarlos en un ErrorBanner
 * (ver `resumenErroresNoAplicados` o `manejarErrorDeFormulario`).
 */
export function aplicarErroresAlFormulario<T extends FieldValues>(
  e: unknown,
  setError: UseFormSetError<T>,
  camposVisibles: CamposVisibles<T>,
): ErroresNoAplicados {
  const noAplicados: ErroresNoAplicados = {};
  for (const [clave, mensaje] of Object.entries(erroresDeCampos(e))) {
    const nombre = resolverCampo(camposVisibles, clave);
    if (nombre) setError(nombre, { type: 'server', message: mensaje });
    else noAplicados[clave] = mensaje;
  }
  return noAplicados;
}

/** `{bodega_id: 'Es obligatorio.'}` → `bodega: Es obligatorio.` (null si no hay nada). */
export function resumenErroresNoAplicados(noAplicados: ErroresNoAplicados): string | null {
  const partes = Object.entries(noAplicados).map(([c, m]) => `${etiquetaCampo(c)}: ${m}`);
  return partes.length ? partes.join('; ') : null;
}

/**
 * Manejo completo del error al enviar un formulario:
 * - VALIDACION: pinta en los campos lo que se pueda; si queda algo sin pintar, devuelve un
 *   ApiError con SOLO esos campos (su `mensajeDeError` los lista);
 * - todo pintado: devuelve null (no hace falta banner);
 * - cualquier otro error: lo devuelve tal cual.
 * Uso: `const pendiente = manejarErrorDeFormulario(e, setError, campos); if (pendiente) setErrorBanner(pendiente);`
 */
export function manejarErrorDeFormulario<T extends FieldValues>(
  e: unknown,
  setError: UseFormSetError<T>,
  camposVisibles: CamposVisibles<T>,
): unknown {
  if (!esApiError(e) || e.codigo !== 'VALIDACION' || !e.campos) return e;
  if (Object.keys(e.campos).length === 0) return e;
  const noAplicados = aplicarErroresAlFormulario(e, setError, camposVisibles);
  const claves = Object.keys(noAplicados);
  if (claves.length === 0) return null;
  const campos = Object.fromEntries(claves.map((c) => [c, e.campos?.[c] ?? []]));
  return new ApiError({
    status: e.status,
    codigo: e.codigo,
    mensaje: e.mensaje,
    detalles: { ...e.detalles, campos },
  });
}
