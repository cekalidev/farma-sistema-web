// Cliente HTTP tipado para la API v1

export const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api/v1';

export type Detalles = Record<string, unknown>;

interface CuerpoError {
  error?: { codigo?: unknown; mensaje?: unknown; detalles?: unknown };
}

/** Error normalizado de la API. `codigo` = 'RED' si no hubo respuesta. */
export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly mensaje: string;
  readonly detalles: Detalles;
  readonly retryAfterSeg?: number;
  /** `detalles.campos` de un 422 VALIDACION (clave con punto → mensajes). */
  readonly campos?: Record<string, string[]>;

  constructor(datos: {
    status: number;
    codigo: string;
    mensaje: string;
    detalles?: Detalles;
    retryAfterSeg?: number;
  }) {
    super(datos.mensaje);
    this.name = 'ApiError';
    this.status = datos.status;
    this.codigo = datos.codigo;
    this.mensaje = datos.mensaje;
    this.detalles = datos.detalles ?? {};
    if (datos.retryAfterSeg !== undefined) this.retryAfterSeg = datos.retryAfterSeg;
    const campos = this.detalles.campos;
    if (campos && typeof campos === 'object' && !Array.isArray(campos)) {
      this.campos = campos as Record<string, string[]>;
    }
  }
}

export function esApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

// ---------- Token y sesión ----------

let tokenActual: string | null = null;

export function establecerToken(token: string | null): void {
  tokenActual = token;
}

export function obtenerToken(): string | null {
  return tokenActual;
}

type OyenteSesion = () => void;
const oyentesSesionExpirada = new Set<OyenteSesion>();

/** Suscribe un callback al 401 NO_AUTENTICADO. Devuelve la función para desuscribir. */
export function alExpirarSesion(oyente: OyenteSesion): () => void {
  oyentesSesionExpirada.add(oyente);
  return () => {
    oyentesSesionExpirada.delete(oyente);
  };
}

// ---------- Peticiones ----------

export type ValorQuery = string | number | boolean | null | undefined;

export interface OpcionesPeticion {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, ValorQuery> | object;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Encabezado Idempotency-Key (UUID). */
  idempotencyKey?: string;
}

export interface RespuestaConMeta<T> {
  data: T;
  status: number;
  /** true si el backend devolvió `Idempotent-Replayed: true`. */
  replayed: boolean;
}

const MAX_REINTENTOS_CONCURRENCIA = 2;

function construirUrl(ruta: string, query?: OpcionesPeticion['query']): string {
  let url = `${API_BASE}${ruta}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(query) as [string, ValorQuery][]) {
      if (valor === undefined || valor === null || valor === '') continue;
      params.append(clave, String(valor));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  // En Node (tests) fetch exige URL absoluta
  if (url.startsWith('/') && typeof location !== 'undefined') {
    url = new URL(url, location.origin).toString();
  }
  return url;
}

function leerRetryAfter(res: Response): number | undefined {
  const valor = res.headers.get('Retry-After');
  if (valor === null) return undefined;
  const seg = Number(valor);
  return Number.isFinite(seg) && seg >= 0 ? seg : undefined;
}

async function errorDesdeRespuesta(res: Response): Promise<ApiError> {
  const cuerpo = (await res.json().catch(() => null)) as CuerpoError | null;
  const err = cuerpo?.error;
  const detalles =
    err?.detalles && typeof err.detalles === 'object' && !Array.isArray(err.detalles)
      ? (err.detalles as Detalles)
      : {};
  let retryAfterSeg = leerRetryAfter(res);
  if (retryAfterSeg === undefined && typeof detalles.segundos === 'number') {
    retryAfterSeg = detalles.segundos;
  }
  return new ApiError({
    status: res.status,
    codigo:
      typeof err?.codigo === 'string'
        ? err.codigo
        : res.status >= 500
          ? 'ERROR_INTERNO'
          : `HTTP_${res.status}`,
    mensaje: typeof err?.mensaje === 'string' ? err.mensaje : `Error HTTP ${res.status}`,
    detalles,
    ...(retryAfterSeg !== undefined ? { retryAfterSeg } : {}),
  });
}

function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Petición con metadatos (status, replayed). Reintenta CONFLICTO_CONCURRENCIA hasta 2 veces. */
export async function peticionConMeta<T>(
  ruta: string,
  opciones: OpcionesPeticion = {},
): Promise<RespuestaConMeta<T>> {
  const { method = 'GET', body, query, headers, signal, idempotencyKey } = opciones;
  const url = construirUrl(ruta, query);
  const cabeceras: Record<string, string> = { Accept: 'application/json', ...headers };
  if (body !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (tokenActual) cabeceras.Authorization = `Bearer ${tokenActual}`;
  if (idempotencyKey) cabeceras['Idempotency-Key'] = idempotencyKey;

  for (let intento = 0; ; intento++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: cabeceras,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new ApiError({
        status: 0,
        codigo: 'RED',
        mensaje: 'No se pudo conectar con el servidor.',
      });
    }

    if (res.ok) {
      const replayed = res.headers.get('Idempotent-Replayed') === 'true';
      if (res.status === 204) return { data: undefined as T, status: 204, replayed };
      const texto = await res.text();
      const data = (texto ? JSON.parse(texto) : undefined) as T;
      return { data, status: res.status, replayed };
    }

    const error = await errorDesdeRespuesta(res);

    if (
      error.status === 409 &&
      error.codigo === 'CONFLICTO_CONCURRENCIA' &&
      intento < MAX_REINTENTOS_CONCURRENCIA
    ) {
      await esperar((error.retryAfterSeg ?? 1) * 1000, signal);
      continue;
    }

    if (error.status === 401 && error.codigo === 'NO_AUTENTICADO' && ruta !== '/auth/login') {
      for (const oyente of oyentesSesionExpirada) oyente();
    }
    throw error;
  }
}

/** Petición que devuelve solo el cuerpo. */
export async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { data } = await peticionConMeta<T>(ruta, opciones);
  return data;
}
