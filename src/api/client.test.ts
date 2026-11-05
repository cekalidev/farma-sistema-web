import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '../mocks/server';
import { api, errorApi } from '../mocks/utilidades';
import { ApiError, alExpirarSesion, establecerToken, peticion, peticionConMeta } from './client';

describe('client', () => {
  it('parsea el error estándar en ApiError', async () => {
    server.use(
      http.get(api('/prueba'), () =>
        errorApi(409, 'STOCK_INSUFICIENTE', 'Stock insuficiente.', {
          solicitado: 5,
          disponible: 2,
        }),
      ),
    );
    const error = await peticion('/prueba').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      codigo: 'STOCK_INSUFICIENTE',
      detalles: { solicitado: 5, disponible: 2 },
    });
  });

  it('envía Bearer, Idempotency-Key y expone replayed', async () => {
    let auth: string | null = null;
    let clave: string | null = null;
    server.use(
      http.post(api('/prueba'), ({ request }) => {
        auth = request.headers.get('Authorization');
        clave = request.headers.get('Idempotency-Key');
        return HttpResponse.json(
          { data: { id: 1 } },
          { headers: { 'Idempotent-Replayed': 'true' } },
        );
      }),
    );
    establecerToken('abc');
    const r = await peticionConMeta<{ data: { id: number } }>('/prueba', {
      method: 'POST',
      body: {},
      idempotencyKey: 'k-1',
    });
    expect(auth).toBe('Bearer abc');
    expect(clave).toBe('k-1');
    expect(r.replayed).toBe(true);
    expect(r.data.data.id).toBe(1);
  });

  it('204 devuelve undefined', async () => {
    server.use(http.post(api('/prueba'), () => new HttpResponse(null, { status: 204 })));
    await expect(peticion('/prueba', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('401 NO_AUTENTICADO dispara la sesión expirada (salvo en login)', async () => {
    const oyente = vi.fn();
    const quitar = alExpirarSesion(oyente);
    server.use(
      http.get(api('/prueba'), () => errorApi(401, 'NO_AUTENTICADO', 'No autenticado.')),
      http.post(api('/auth/login'), () => errorApi(401, 'NO_AUTENTICADO', 'No autenticado.')),
    );
    await expect(peticion('/prueba')).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
    expect(oyente).toHaveBeenCalledTimes(1);
    await expect(peticion('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(oyente).toHaveBeenCalledTimes(1);
    quitar();
  });

  it('reintenta CONFLICTO_CONCURRENCIA hasta 2 veces', async () => {
    let llamadas = 0;
    server.use(
      http.post(api('/prueba'), () => {
        llamadas++;
        if (llamadas < 3) {
          return errorApi(
            409,
            'CONFLICTO_CONCURRENCIA',
            'Conflicto.',
            { reintentable: true },
            { 'Retry-After': '0' },
          );
        }
        return HttpResponse.json({ data: 'ok' });
      }),
    );
    await expect(peticion('/prueba', { method: 'POST', body: {} })).resolves.toEqual({
      data: 'ok',
    });
    expect(llamadas).toBe(3);
  });

  it('se rinde tras 2 reintentos de concurrencia', async () => {
    let llamadas = 0;
    server.use(
      http.post(api('/prueba'), () => {
        llamadas++;
        return errorApi(409, 'CONFLICTO_CONCURRENCIA', 'Conflicto.', {}, { 'Retry-After': '0' });
      }),
    );
    await expect(peticion('/prueba', { method: 'POST' })).rejects.toMatchObject({
      codigo: 'CONFLICTO_CONCURRENCIA',
      retryAfterSeg: 0,
    });
    expect(llamadas).toBe(3);
  });

  it('error de red → codigo RED', async () => {
    server.use(http.get(api('/prueba'), () => HttpResponse.error()));
    await expect(peticion('/prueba')).rejects.toMatchObject({ codigo: 'RED', status: 0 });
  });

  it('respuesta no JSON en 5xx → ERROR_INTERNO', async () => {
    server.use(http.get(api('/prueba'), () => new HttpResponse('<html>', { status: 502 })));
    await expect(peticion('/prueba')).rejects.toMatchObject({
      codigo: 'ERROR_INTERNO',
      status: 502,
    });
  });

  it('omite filtros vacíos en la query', async () => {
    let url = '';
    server.use(
      http.get(api('/prueba'), ({ request }) => {
        url = request.url;
        return HttpResponse.json({});
      }),
    );
    await peticion('/prueba', { query: { a: 1, b: undefined, c: '', d: null, e: 'x' } });
    expect(new URL(url).search).toBe('?a=1&e=x');
  });
});
