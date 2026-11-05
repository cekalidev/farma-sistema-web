import { describe, expect, it } from 'vite-plus/test';
import { usuarioPorRol } from '../mocks/datos';
import { puede, puedeVerSeccion, rutaInicio } from './permisos';

describe('permisos', () => {
  it('habilidades por rol', () => {
    expect(puede(usuarioPorRol('auxiliar_farmacia'), 'dispensacion.crear')).toBe(true);
    expect(puede(usuarioPorRol('auxiliar_farmacia'), 'dispensacion.autorizar')).toBe(false);
    expect(puede(usuarioPorRol('regente_farmacia'), 'traslado.aprobar')).toBe(true);
    expect(puede(null, 'inventario.consultar')).toBe(false);
  });

  it('secciones visibles', () => {
    const auditor = usuarioPorRol('auditor');
    expect(puedeVerSeccion(auditor, 'dispensacion')).toBe(false);
    expect(puedeVerSeccion(auditor, 'traslados')).toBe(true);
    expect(puedeVerSeccion(auditor, 'kardex')).toBe(true);
    expect(puedeVerSeccion(usuarioPorRol('medico'), 'inventario')).toBe(false);
  });

  it('inicio por rol', () => {
    expect(rutaInicio(usuarioPorRol('auxiliar_farmacia'))).toBe('/dispensacion');
    expect(rutaInicio(usuarioPorRol('regente_farmacia'))).toBe('/dispensacion');
    expect(rutaInicio(usuarioPorRol('auditor'))).toBe('/inventario');
    expect(rutaInicio(usuarioPorRol('medico'))).toBeNull();
    expect(rutaInicio(usuarioPorRol('admin'))).toBeNull();
  });
});
