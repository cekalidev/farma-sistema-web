// Alertas de vencimiento y stock mínimo (AÚN NO EXISTEN en el backend)
import { http, HttpResponse, type HttpHandler } from 'msw';
import type { AlertaStockMinimo, AlertaVencimiento } from '../../api/tipos';
import { diasHastaVencer } from '../../lib/fechas';
import { BODEGAS, EXISTENCIAS, MINIMOS, PRODUCTOS } from '../datos';
import { api, autorizar, filtroNum } from '../utilidades';

const DIAS_ALERTA = 90;

export const handlersReales: HttpHandler[] = [];

export const handlersFaltantes: HttpHandler[] = [
  http.get(api('/alertas/vencimientos'), ({ request }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    const bodega = filtroNum(request, 'bodega_id');
    const data: AlertaVencimiento[] = EXISTENCIAS.filter(
      (e) => e.cantidad > 0 && (bodega === undefined || e.bodega_id === bodega),
    )
      .map((e) => ({ e, dias: diasHastaVencer(e.fecha_vencimiento) }))
      .filter(({ dias }) => dias <= DIAS_ALERTA)
      .toSorted((a, b) => a.e.fecha_vencimiento.localeCompare(b.e.fecha_vencimiento))
      .map(({ e, dias }) => ({
        tipo: dias <= 0 ? 'VENCIDO' : 'POR_VENCER',
        dias_restantes: dias,
        existencia_id: e.id,
        bodega: e.bodega,
        producto: e.producto,
        lote: e.lote,
        cantidad: e.cantidad,
      }));
    return HttpResponse.json({ data });
  }),

  http.get(api('/alertas/stock-minimo'), ({ request }) => {
    const u = autorizar(request, 'inventario.consultar');
    if (u instanceof Response) return u;
    const bodega = filtroNum(request, 'bodega_id');
    const data: AlertaStockMinimo[] = [];
    for (const m of MINIMOS) {
      if (bodega !== undefined && m.bodega_id !== bodega) continue;
      const actual = EXISTENCIAS.filter(
        (e) => e.bodega_id === m.bodega_id && e.producto_id === m.producto_id && !e.vencido,
      ).reduce((s, e) => s + e.cantidad, 0);
      if (actual >= m.minimo) continue;
      const b = BODEGAS.find((x) => x.id === m.bodega_id);
      const p = PRODUCTOS.find((x) => x.id === m.producto_id);
      if (!b || !p) continue;
      data.push({
        bodega: { id: b.id, codigo: b.codigo, nombre: b.nombre },
        producto: { id: p.id, codigo: p.codigo, nombre: p.nombre },
        actual,
        minimo: m.minimo,
      });
    }
    return HttpResponse.json({ data });
  }),
];
