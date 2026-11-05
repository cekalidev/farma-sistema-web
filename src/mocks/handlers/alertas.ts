// Alertas de vencimiento y stock mínimo (RN-11, contrato §4.8): paginadas, con meta.hoy
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { AlertaStockMinimo, AlertasPaginadas, AlertaVencimiento } from '../../api/tipos';
import { diasHastaVencer, hoyISO } from '../../lib/fechas';
import { BODEGAS, EXISTENCIAS, MINIMOS, PRODUCTOS } from '../datos';
import { api, autorizar, errorApi, filtroNum, paginar } from '../utilidades';

/** `farma.dias_alerta_vencimiento` del backend (90 por defecto). */
const DIAS_ALERTA = 90;
const TIPOS = new Set(['VENCIDO', 'POR_VENCER']);

/** 422 si un filtro numérico no es un entero positivo. */
function validarFiltros(request: Request, claves: string[]): Response | null {
  const q = new URL(request.url).searchParams;
  const campos: Record<string, string[]> = {};
  for (const clave of claves) {
    const v = q.get(clave);
    if (v !== null && v !== '' && !/^[1-9]\d{0,17}$/.test(v)) {
      campos[clave] = [`The ${clave.replace('_', ' ')} field must be an integer.`];
    }
  }
  const tipo = q.get('tipo');
  if (claves.includes('tipo') && tipo !== null && tipo !== '' && !TIPOS.has(tipo)) {
    campos.tipo = ['The selected tipo is invalid.'];
  }
  return Object.keys(campos).length
    ? errorApi(422, 'VALIDACION', 'Los datos enviados no son válidos.', { campos })
    : null;
}

export const handlersReales: HttpHandler[] = [
  http.get(api('/alertas/vencimientos'), ({ request }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    const invalido = validarFiltros(request, ['bodega_id', 'producto_id', 'tipo']);
    if (invalido) return invalido;
    const bodega = filtroNum(request, 'bodega_id');
    const producto = filtroNum(request, 'producto_id');
    const tipo = new URL(request.url).searchParams.get('tipo') || undefined;
    const hoy = hoyISO();
    const filas: AlertaVencimiento[] = EXISTENCIAS.filter(
      (e) =>
        e.cantidad > 0 &&
        (bodega === undefined || e.bodega_id === bodega) &&
        (producto === undefined || e.producto_id === producto),
    )
      .map((e) => ({ e, dias: diasHastaVencer(e.fecha_vencimiento, hoy) }))
      .filter(({ dias }) => dias <= DIAS_ALERTA)
      .map(({ e, dias }) => ({
        existencia_id: e.id,
        bodega: e.bodega,
        producto: e.producto,
        lote: e.lote,
        fecha_vencimiento: e.fecha_vencimiento,
        cantidad: e.cantidad,
        tipo: dias <= 0 ? ('VENCIDO' as const) : ('POR_VENCER' as const),
        dias_restantes: dias,
      }))
      .filter((a) => tipo === undefined || a.tipo === tipo)
      .toSorted(
        (a, b) =>
          a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) ||
          a.lote.id - b.lote.id ||
          a.existencia_id - b.existencia_id,
      );
    const pagina = paginar(filas, request);
    const cuerpo: AlertasPaginadas<AlertaVencimiento> = {
      ...pagina,
      meta: { ...pagina.meta, hoy, dias_alerta_vencimiento: DIAS_ALERTA },
    };
    return HttpResponse.json(cuerpo);
  }),

  http.get(api('/alertas/stock-minimo'), ({ request }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    const invalido = validarFiltros(request, ['bodega_id', 'producto_id']);
    if (invalido) return invalido;
    const bodega = filtroNum(request, 'bodega_id');
    const producto = filtroNum(request, 'producto_id');
    const hoy = hoyISO();
    const filas: AlertaStockMinimo[] = [];
    MINIMOS.forEach((m, i) => {
      if (m.minimo <= 0) return;
      if (bodega !== undefined && m.bodega_id !== bodega) return;
      if (producto !== undefined && m.producto_id !== producto) return;
      // Stock vigente: lotes que vencen después de hoy
      const actual = EXISTENCIAS.filter(
        (e) =>
          e.bodega_id === m.bodega_id &&
          e.producto_id === m.producto_id &&
          diasHastaVencer(e.fecha_vencimiento, hoy) > 0,
      ).reduce((s, e) => s + e.cantidad, 0);
      if (actual >= m.minimo) return;
      const b = BODEGAS.find((x) => x.id === m.bodega_id);
      const p = PRODUCTOS.find((x) => x.id === m.producto_id);
      if (!b || !p) return;
      filas.push({
        stock_minimo_id: i + 1,
        bodega: { id: b.id, codigo: b.codigo, nombre: b.nombre },
        producto: { id: p.id, codigo: p.codigo, nombre: p.nombre },
        minimo: m.minimo,
        actual,
        faltante: m.minimo - actual,
      });
    });
    filas.sort(
      (a, b) =>
        b.faltante - a.faltante ||
        a.bodega.id - b.bodega.id ||
        a.producto.id - b.producto.id ||
        a.stock_minimo_id - b.stock_minimo_id,
    );
    const pagina = paginar(filas, request);
    const cuerpo: AlertasPaginadas<AlertaStockMinimo> = {
      ...pagina,
      meta: { ...pagina.meta, hoy },
    };
    return HttpResponse.json(cuerpo);
  }),
];

export const handlersFaltantes: HttpHandler[] = [];
