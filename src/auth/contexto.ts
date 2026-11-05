// Contexto de autenticación (separado del proveedor para no romper fast refresh)
import { createContext } from 'react';
import type { Usuario } from '../api/tipos';

export interface ValorAuth {
  usuario: Usuario | null;
  /** true mientras se valida el token guardado (GET /auth/me). */
  cargando: boolean;
  /** Aviso a mostrar en el login (p. ej. sesión expirada). */
  aviso: string | null;
  /**
   * Error al validar el token guardado que NO es 401 (red, 5xx). El token se conserva;
   * la UI muestra "No se pudo validar la sesión" con Reintentar.
   */
  errorSesion: unknown;
  /** Vuelve a consultar /auth/me con el token guardado. */
  reintentarSesion: () => void;
  iniciarSesion: (email: string, password: string) => Promise<Usuario>;
  cerrarSesion: () => Promise<void>;
}

export const ContextoAuth = createContext<ValorAuth | null>(null);
