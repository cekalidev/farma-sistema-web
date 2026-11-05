// Contexto de autenticación (separado del proveedor para no romper fast refresh)
import { createContext } from 'react';
import type { Usuario } from '../api/tipos';

export interface ValorAuth {
  usuario: Usuario | null;
  /** true mientras se valida el token guardado (GET /auth/me). */
  cargando: boolean;
  /** Aviso a mostrar en el login (p. ej. sesión expirada). */
  aviso: string | null;
  iniciarSesion: (email: string, password: string) => Promise<Usuario>;
  cerrarSesion: () => Promise<void>;
}

export const ContextoAuth = createContext<ValorAuth | null>(null);
