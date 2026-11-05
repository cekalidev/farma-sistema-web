import { describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from './client';
import {
  aplicarErroresAlFormulario,
  erroresDeCampos,
  esResultadoIncierto,
  manejarErrorDeFormulario,
  mensajeDeError,
  resumenErroresNoAplicados,
} from './errores';

const err = (codigo: string, detalles: Record<string, unknown> = {}, status = 422) =>
  new ApiError({ status, codigo, mensaje: 'x', detalles });

describe('mensajeDeError', () => {
  it('STOCK_INSUFICIENTE con vencido no dispensable', () => {
    const m = mensajeDeError(
      err(
        'STOCK_INSUFICIENTE',
        { solicitado: 30, disponible: 12, vencido_no_dispensable: 40 },
        409,
      ),
    );
    expect(m).toContain('solicitado 30');
    expect(m).toContain('disponible 12');
    expect(m).toContain('40 unidad(es) vencidas');
  });

  it('STOCK_INSUFICIENTE en traslado', () => {
    const m = mensajeDeError(
      err(
        'STOCK_INSUFICIENTE',
        { traslado_item_id: 3, lote_id: 1, solicitado: 9, disponible: 4 },
        409,
      ),
    );
    expect(m).toMatch(/bodega de origen: solicitado 9, disponible 4/);
  });

  it('CANTIDAD_EXCEDE_PRESCRITO', () => {
    expect(
      mensajeDeError(err('CANTIDAD_EXCEDE_PRESCRITO', { pendiente: 10, solicitado: 15 })),
    ).toBe('La cantidad solicitada (15) supera lo pendiente por dispensar (10).');
  });

  it('LOTE_VENCIDO con lote y fecha', () => {
    expect(
      mensajeDeError(
        err('LOTE_VENCIDO', { lote_codigo: 'ACET500-A', fecha_vencimiento: '2026-10-16' }),
      ),
    ).toBe('El lote ACET500-A está vencido (venció el 16/10/2026) y no puede moverse.');
  });

  it('SEGREGACION_FUNCIONES distingue aprobar y resolver', () => {
    expect(mensajeDeError(err('SEGREGACION_FUNCIONES', { accion: 'aprobar' }, 403))).toMatch(
      /no puede aprobarlo/,
    );
    expect(
      mensajeDeError(err('SEGREGACION_FUNCIONES', { accion: 'resolver_discrepancia' }, 403)),
    ).toBe('Debe resolverla otro regente distinto de quien solicitó el traslado.');
  });

  it('TRANSICION_INVALIDA usa estado y acción', () => {
    expect(
      mensajeDeError(err('TRANSICION_INVALIDA', { estado: 'EN_TRANSITO', accion: 'anular' }, 409)),
    ).toMatch(/No se puede anular .* en tránsito/);
  });

  it('VALIDACION con campos traducidos', () => {
    const e = err('VALIDACION', {
      campos: {
        'items.0.cantidad': ['The items.0.cantidad field must be at least 1.'],
        motivo: ['The motivo field must be at least 10 characters.'],
        bodega_id: ['Something unknown happened.'],
      },
    });
    expect(erroresDeCampos(e)).toEqual({
      'items.0.cantidad': 'Debe ser mayor o igual a 1.',
      motivo: 'Debe tener al menos 10 caracteres.',
      bodega_id: 'El valor no es válido.',
    });
    expect(mensajeDeError(e)).toContain('cantidad (ítem 1): Debe ser mayor o igual a 1;');
  });

  it('aplica solo los campos visibles y devuelve el resto', () => {
    const setError = vi.fn();
    const e = err('VALIDACION', {
      campos: {
        email: ['The email field is required.'],
        bodega_id: ['The bodega id field is required.'],
      },
    });
    const resto = aplicarErroresAlFormulario(e, setError, ['email']);
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Es obligatorio.' });
    expect(resto).toEqual({ bodega_id: 'Es obligatorio.' });
    expect(resumenErroresNoAplicados(resto)).toBe('bodega: Es obligatorio.');
    expect(resumenErroresNoAplicados({})).toBeNull();
  });

  it('acepta un mapeo y una función de campos', () => {
    const setError = vi.fn();
    const e = err('VALIDACION', {
      campos: { 'lote.codigo': ['The lote.codigo field is required.'], cantidad: ['x'] },
    });
    expect(aplicarErroresAlFormulario(e, setError, { 'lote.codigo': 'codigo' })).toEqual({
      cantidad: 'El valor no es válido.',
    });
    expect(setError).toHaveBeenCalledWith('codigo', expect.anything());
    const setError2 = vi.fn();
    expect(
      aplicarErroresAlFormulario(e, setError2, (c) => (c === 'cantidad' ? 'cantidad' : null)),
    ).toEqual({ 'lote.codigo': 'Es obligatorio.' });
  });

  it('manejarErrorDeFormulario: null si todo se pintó; si no, error solo con lo pendiente', () => {
    const setError = vi.fn();
    const todo = err('VALIDACION', { campos: { email: ['The email field is required.'] } });
    expect(manejarErrorDeFormulario(todo, setError, ['email'])).toBeNull();
    const parcial = err('VALIDACION', {
      campos: { email: ['The email field is required.'], bodega_id: ['Required.'] },
    });
    const pendiente = manejarErrorDeFormulario(parcial, setError, ['email']);
    expect(mensajeDeError(pendiente)).toBe('Revisa los datos: bodega: El valor no es válido.');
    const otro = err('NO_AUTORIZADO', {}, 403);
    expect(manejarErrorDeFormulario(otro, setError, ['email'])).toBe(otro);
  });

  it('manejarErrorDeFormulario conserva el código de seguimiento', () => {
    const e = new ApiError({
      status: 422,
      codigo: 'VALIDACION',
      mensaje: 'x',
      detalles: { campos: { email: ['Required.'], bodega_id: ['Required.'] } },
      correlacionId: 'corr-123',
    });
    const pendiente = manejarErrorDeFormulario(e, vi.fn(), ['email']);
    expect(pendiente).toBeInstanceOf(ApiError);
    expect(pendiente).toMatchObject({ status: 422, correlacionId: 'corr-123' });
  });

  it('no deja pasar mensajes desconocidos del backend (aunque tengan tildes)', () => {
    const e = err('VALIDACION', { campos: { motivo: ['Paciente Ana Pérez ya tenía esto.'] } });
    expect(erroresDeCampos(e)).toEqual({ motivo: 'El valor no es válido.' });
    const raro = new ApiError({ status: 418, codigo: 'ALGO_NUEVO', mensaje: 'CC 9900000001' });
    expect(mensajeDeError(raro)).not.toContain('9900000001');
    expect(mensajeDeError(raro)).toContain('ALGO_NUEVO');
  });

  it('esResultadoIncierto: RED y 5xx', () => {
    expect(esResultadoIncierto(err('RED', {}, 0))).toBe(true);
    expect(esResultadoIncierto(err('ERROR_INTERNO', {}, 500))).toBe(true);
    expect(esResultadoIncierto(err('HTTP_504', {}, 504))).toBe(true);
    expect(esResultadoIncierto(err('STOCK_INSUFICIENTE', {}, 409))).toBe(false);
    expect(esResultadoIncierto(new Error('x'))).toBe(false);
  });

  it('DEMASIADAS_SOLICITUDES con segundos, RED y desconocido', () => {
    const e = new ApiError({
      status: 429,
      codigo: 'DEMASIADAS_SOLICITUDES',
      mensaje: 'x',
      retryAfterSeg: 42,
    });
    expect(mensajeDeError(e)).toMatch(/Espera 42 segundo/);
    expect(mensajeDeError(err('RED', {}, 0))).toMatch(/No se pudo conectar con el servidor/);
    expect(mensajeDeError(new Error('boom'))).toMatch(/error inesperado/);
  });
});
