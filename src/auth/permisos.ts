// Permisos por habilidades del usuario
import type { Habilidad, Rol, Usuario } from '../api/tipos';

export function puede(usuario: Usuario | null | undefined, habilidad: Habilidad): boolean {
  return !!usuario && usuario.habilidades.includes(habilidad);
}

export function puedeAlguna(
  usuario: Usuario | null | undefined,
  habilidades: Habilidad[],
): boolean {
  return habilidades.some((h) => puede(usuario, h));
}

export const NOMBRE_ROL: Record<Rol, string> = {
  auxiliar_farmacia: 'Auxiliar de farmacia',
  regente_farmacia: 'Regente de farmacia',
  medico: 'Médico',
  auditor: 'Auditor',
  admin: 'Administrador',
};

export const esRegente = (u: Usuario | null | undefined) => u?.rol === 'regente_farmacia';
export const esAuxiliar = (u: Usuario | null | undefined) => u?.rol === 'auxiliar_farmacia';
export const esAuditor = (u: Usuario | null | undefined) => u?.rol === 'auditor';

/** Habilidades que habilitan cada sección. */
export const PERMISOS_SECCION = {
  dispensacion: ['dispensacion.crear', 'dispensacion.autorizar'],
  traslados: ['traslado.consultar'],
  inventario: ['inventario.consultar'],
  kardex: ['inventario.consultar'],
} as const satisfies Record<string, Habilidad[]>;

export type Seccion = keyof typeof PERMISOS_SECCION;

export function puedeVerSeccion(usuario: Usuario | null | undefined, seccion: Seccion): boolean {
  return puedeAlguna(usuario, [...PERMISOS_SECCION[seccion]]);
}

/** Ruta de inicio según el rol; null si el rol no tiene pantallas aquí. */
export function rutaInicio(usuario: Usuario | null | undefined): string | null {
  if (!usuario) return '/login';
  if (usuario.rol === 'auxiliar_farmacia' || usuario.rol === 'regente_farmacia')
    return '/dispensacion';
  if (usuario.rol === 'auditor') return '/inventario';
  return null;
}
