// Kardex (existe en el backend): listado filtrado e inmutable, en orden ascendente
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { Existencia, MovimientoKardex, TipoMovimiento } from '../../api/tipos';
import { fechaRelativa } from '../../lib/fechas';
import { EXISTENCIAS, USUARIOS } from '../datos';
import { api, autorizar, errorApi, filtroNum, paginar } from '../utilidades';

const MOVIMIENTOS: MovimientoKardex[] = [];
let siguienteId = 1;

interface NuevoMovimiento {
  tipo: TipoMovimiento;
  existencia: Existencia;
  /** Con signo. */
  cantidad: number;
  saldoAnterior: number;
  motivo?: string | null;
  usuarioId: number;
  documento?: MovimientoKardex['documento'];
  createdAt?: string;
}

/** Añade un movimiento al kardex mock (lo usan los handlers que mueven stock). */
export function registrarMovimiento(m: NuevoMovimiento): MovimientoKardex {
  const e = m.existencia;
  const u = USUARIOS.find((x) => x.id === m.usuarioId);
  const mov: MovimientoKardex = {
    id: siguienteId++,
    tipo: m.tipo,
    existencia_id: e.id,
    bodega_id: e.bodega_id,
    producto_id: e.producto_id,
    lote_id: e.lote_id,
    bodega: e.bodega,
    producto: e.producto,
    lote: e.lote,
    cantidad: m.cantidad,
    saldo_anterior: m.saldoAnterior,
    saldo_posterior: m.saldoAnterior + m.cantidad,
    motivo: m.motivo ?? null,
    usuario_id: m.usuarioId,
    usuario: { id: m.usuarioId, nombre: u?.nombre ?? `Usuario ${m.usuarioId}` },
    documento: m.documento ?? null,
    created_at: m.createdAt ?? new Date().toISOString(),
  };
  MOVIMIENTOS.push(mov);
  return mov;
}

/** Semilla: una ENTRADA por existencia, coherente con su saldo actual. */
function sembrar(): void {
  for (const e of EXISTENCIAS) {
    const diasAtras = 3 + (e.id % 10);
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - diasAtras);
    fecha.setHours(8, e.id % 60, 0, 0);
    registrarMovimiento({
      tipo: 'ENTRADA',
      existencia: e,
      cantidad: e.cantidad,
      saldoAnterior: 0,
      usuarioId: 2,
      createdAt: fecha.toISOString(),
    });
  }
}
sembrar();

/** Reinicia el kardex mock con la semilla (tests). */
export function reiniciarKardex(): void {
  MOVIMIENTOS.length = 0;
  siguienteId = 1;
  sembrar();
}

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
