// Inventario (existe en el backend): consulta con filtros, ajustes y entradas
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Existencia, ResultadoEntrada } from '../../api/tipos';
import { diasHastaVencer } from '../../lib/fechas';
import { BODEGAS, EXISTENCIAS, LOTES, PRODUCTOS, type Lote } from '../datos';
import { api, autorizar, errorApi, filtroNum, paginar } from '../utilidades';
import { registrarMovimiento, reiniciarKardex } from './kardex';

// Estado inicial para poder reiniciar en tests
const CANTIDADES_INICIALES = new Map(EXISTENCIAS.map((e) => [e.id, e.cantidad]));
const TOTAL_EXISTENCIAS = EXISTENCIAS.length;
const TOTAL_LOTES = LOTES.length;

/** Tope por movimiento (S-24, S-32) y del saldo (columna integer). */
const CANTIDAD_MAXIMA = 1_000_000;
const SALDO_MAXIMO = 2_147_483_647;

/** Restaura existencias, lotes y el kardex sembrado (tests). */
export function reiniciarInventario(): void {
  EXISTENCIAS.length = TOTAL_EXISTENCIAS;
  LOTES.length = TOTAL_LOTES;
  for (const e of EXISTENCIAS) e.cantidad = CANTIDADES_INICIALES.get(e.id) ?? e.cantidad;
  reiniciarKardex();
}

const esEntero = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

interface CuerpoEntrada {
  bodega_id?: unknown;
  producto_id?: unknown;
  cantidad?: unknown;
  lote_id?: unknown;
  lote?: { codigo?: unknown; fecha_vencimiento?: unknown };
}

function validarEntrada(c: CuerpoEntrada): Record<string, string[]> {
  const campos: Record<string, string[]> = {};
  if (!esEntero(c.bodega_id) || !BODEGAS.some((b) => b.id === c.bodega_id && b.activa)) {
    campos.bodega_id = ['The selected bodega id is invalid.'];
  }
  if (!esEntero(c.producto_id) || !PRODUCTOS.some((p) => p.id === c.producto_id && p.activo)) {
    campos.producto_id = ['The selected producto id is invalid.'];
  }
  if (!esEntero(c.cantidad)) campos.cantidad = ['The cantidad field must be an integer.'];
  else if (c.cantidad < 1) campos.cantidad = ['The cantidad field must be at least 1.'];
  else if (c.cantidad > CANTIDAD_MAXIMA) {
    campos.cantidad = [`The cantidad field must not be greater than ${CANTIDAD_MAXIMA}.`];
  }
  if (c.lote_id !== undefined && c.lote !== undefined) {
    campos.lote_id = ['The lote id field prohibits lote from being present.'];
  } else if (c.lote_id !== undefined) {
    if (
      !esEntero(c.lote_id) ||
      !LOTES.some((l) => l.id === c.lote_id && l.producto_id === c.producto_id)
    ) {
      campos.lote_id = ['The selected lote id is invalid.'];
    }
  } else if (c.lote === undefined) {
    campos.lote_id = ['The lote id field is required when lote is not present.'];
  } else {
    const { codigo, fecha_vencimiento: fecha } = c.lote;
    if (typeof codigo !== 'string' || !/^\S(.*\S)?$/.test(codigo) || codigo.length > 50) {
      campos['lote.codigo'] = ['The lote.codigo field format is invalid.'];
    }
    if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      campos['lote.fecha_vencimiento'] = [
        'The lote.fecha vencimiento field must match the format Y-m-d.',
      ];
    }
  }
  return campos;
}

function validarAjuste(cuerpo: unknown): Record<string, string[]> {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const campos: Record<string, string[]> = {};
  if (typeof c.existencia_id !== 'number' || !Number.isInteger(c.existencia_id)) {
    campos.existencia_id = ['The existencia id field is required.'];
  }
  if (typeof c.cantidad !== 'number' || !Number.isInteger(c.cantidad)) {
    campos.cantidad = ['The cantidad field must be an integer.'];
  } else if (c.cantidad === 0) {
    campos.cantidad = ['The cantidad field is invalid.'];
  } else if (Math.abs(c.cantidad) > CANTIDAD_MAXIMA) {
    campos.cantidad = [`The cantidad field must not be greater than ${CANTIDAD_MAXIMA}.`];
  }
  if (typeof c.motivo !== 'string') {
    campos.motivo = ['The motivo field is required.'];
  } else if (/[\r\n]/.test(c.motivo)) {
    campos.motivo = ['The motivo field must not contain line breaks.'];
  } else if (c.motivo.trim().length < 10) {
    campos.motivo = ['The motivo field must be at least 10 characters.'];
  } else if (c.motivo.trim().length > 500) {
    campos.motivo = ['The motivo field must not be greater than 500 characters.'];
  }
  return campos;
}

export const handlersReales: HttpHandler[] = [
  http.get(api('/inventario'), ({ request }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    const bodega = filtroNum(request, 'bodega_id');
    const producto = filtroNum(request, 'producto_id');
    const lote = filtroNum(request, 'lote_id');
    const filas = EXISTENCIAS.filter(
      (e) =>
        (bodega === undefined || e.bodega_id === bodega) &&
        (producto === undefined || e.producto_id === producto) &&
        (lote === undefined || e.lote_id === lote),
    );
    return HttpResponse.json(paginar(filas, request));
  }),

  http.post(api('/inventario/ajustes'), async ({ request }) => {
    const u = autorizar(request, 'inventario.registrar');
    if (u instanceof Response) return u;
    const cuerpo = (await request.json().catch(() => null)) as {
      existencia_id: number;
      cantidad: number;
      motivo: string;
    } | null;
    const campos = validarAjuste(cuerpo);
    if (!cuerpo || Object.keys(campos).length) {
      return errorApi(422, 'VALIDACION', 'Datos inválidos.', { campos });
    }
    const existencia = EXISTENCIAS.find((e) => e.id === cuerpo.existencia_id);
    if (!existencia) {
      return errorApi(422, 'VALIDACION', 'Datos inválidos.', {
        campos: { existencia_id: ['The selected existencia id is invalid.'] },
      });
    }
    const saldoAnterior = existencia.cantidad;
    if (saldoAnterior + cuerpo.cantidad < 0) {
      return errorApi(409, 'STOCK_INSUFICIENTE', 'Stock insuficiente.', {
        existencia_id: existencia.id,
        disponible: saldoAnterior,
        solicitado: -cuerpo.cantidad,
      });
    }
    if (saldoAnterior + cuerpo.cantidad > SALDO_MAXIMO) {
      return errorApi(422, 'CANTIDAD_EXCEDE_MAXIMO', 'Excede el máximo.', { maximo: SALDO_MAXIMO });
    }
    existencia.cantidad = saldoAnterior + cuerpo.cantidad;
    const mov = registrarMovimiento({
      tipo: 'AJUSTE',
      existencia,
      cantidad: cuerpo.cantidad,
      saldoAnterior,
      motivo: cuerpo.motivo.trim(),
      usuarioId: u.id,
    });
    return HttpResponse.json({ data: mov }, { status: 201 });
  }),

  http.post(api('/inventario/entradas'), async ({ request }) => {
    const u = autorizar(request, 'inventario.registrar');
    if (u instanceof Response) return u;
    const c = ((await request.json().catch(() => null)) ?? {}) as CuerpoEntrada;
    const campos = validarEntrada(c);
    if (Object.keys(campos).length) {
      return errorApi(422, 'VALIDACION', 'Datos inválidos.', { campos });
    }
    const bodegaId = c.bodega_id as number;
    const productoId = c.producto_id as number;
    const cantidad = c.cantidad as number;

    // Resuelve el lote: por id, o por código (se crea si no existe)
    let lote: Lote | undefined;
    let loteCreado = false;
    if (c.lote_id !== undefined) {
      lote = LOTES.find((l) => l.id === c.lote_id);
    } else {
      const codigo = c.lote?.codigo as string;
      const fecha = c.lote?.fecha_vencimiento as string;
      lote = LOTES.find((l) => l.producto_id === productoId && l.codigo === codigo);
      if (lote && lote.fecha_vencimiento !== fecha) {
        return errorApi(422, 'LOTE_NO_COINCIDE', 'El lote no coincide.', {
          lote_id: lote.id,
          lote_codigo: lote.codigo,
          fecha_registrada: lote.fecha_vencimiento,
          fecha_enviada: fecha,
        });
      }
      if (!lote) {
        if (diasHastaVencer(fecha) <= 0) {
          return errorApi(422, 'LOTE_VENCIDO', 'Lote vencido.', {
            lote_id: null,
            lote_codigo: codigo,
            producto_id: productoId,
            fecha_vencimiento: fecha,
          });
        }
        lote = {
          id: Math.max(...LOTES.map((l) => l.id)) + 1,
          producto_id: productoId,
          codigo,
          fecha_vencimiento: fecha,
        };
        LOTES.push(lote);
        loteCreado = true;
      }
    }
    if (!lote) return errorApi(404, 'NO_ENCONTRADO', 'No encontrado.');
    const loteId = lote.id;
    if (diasHastaVencer(lote.fecha_vencimiento) <= 0) {
      return errorApi(422, 'LOTE_VENCIDO', 'Lote vencido.', {
        lote_id: lote.id,
        lote_codigo: lote.codigo,
        producto_id: lote.producto_id,
        fecha_vencimiento: lote.fecha_vencimiento,
      });
    }

    let existencia = EXISTENCIAS.find((e) => e.bodega_id === bodegaId && e.lote_id === loteId);
    if (!existencia) {
      const b = BODEGAS.find((x) => x.id === bodegaId);
      const p = PRODUCTOS.find((x) => x.id === productoId);
      if (!b || !p) return errorApi(404, 'NO_ENCONTRADO', 'No encontrado.');
      const nueva: Existencia = {
        id: Math.max(0, ...EXISTENCIAS.map((e) => e.id)) + 1,
        bodega_id: b.id,
        producto_id: p.id,
        lote_id: lote.id,
        bodega: { id: b.id, codigo: b.codigo, nombre: b.nombre },
        producto: { id: p.id, codigo: p.codigo, nombre: p.nombre },
        lote: { id: lote.id, codigo: lote.codigo, fecha_vencimiento: lote.fecha_vencimiento },
        fecha_vencimiento: lote.fecha_vencimiento,
        cantidad: 0,
        vencido: false,
      };
      EXISTENCIAS.push(nueva);
      existencia = nueva;
    }
    const saldoAnterior = existencia.cantidad;
    if (saldoAnterior + cantidad > SALDO_MAXIMO) {
      return errorApi(422, 'CANTIDAD_EXCEDE_MAXIMO', 'Excede el máximo.', { maximo: SALDO_MAXIMO });
    }
    existencia.cantidad = saldoAnterior + cantidad;
    const mov = registrarMovimiento({
      tipo: 'ENTRADA',
      existencia,
      cantidad,
      saldoAnterior,
      usuarioId: u.id,
    });
    const data: ResultadoEntrada = {
      ...existencia,
      entrada: {
        cantidad,
        saldo_anterior: saldoAnterior,
        saldo_posterior: existencia.cantidad,
        lote_creado: loteCreado,
        movimiento_id: mov.id,
      },
    };
    return HttpResponse.json({ data }, { status: 201 });
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
