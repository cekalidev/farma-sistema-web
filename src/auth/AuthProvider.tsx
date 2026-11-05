// Sesión: token en sessionStorage, usuario desde /auth/me
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { alExpirarSesion, establecerToken, esApiError } from '../api/client';
import { login, logout, obtenerUsuarioActual } from '../api/endpoints/auth';
import type { Usuario } from '../api/tipos';
import { ContextoAuth, type ValorAuth } from './contexto';

export const CLAVE_TOKEN = 'farma.token';

function leerToken(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

function guardarToken(token: string | null): void {
  establecerToken(token);
  try {
    if (token) sessionStorage.setItem(CLAVE_TOKEN, token);
    else sessionStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // almacenamiento no disponible: la sesión vive solo en memoria
  }
}

interface Props {
  children: ReactNode;
  /** Solo tests: arranca con este usuario sin consultar /auth/me. */
  usuarioInicial?: Usuario | null;
}

export function AuthProvider({ children, usuarioInicial }: Props) {
  const queryClient = useQueryClient();
  const [usuario, setUsuario] = useState<Usuario | null>(usuarioInicial ?? null);
  const [cargando, setCargando] = useState<boolean>(() => {
    if (usuarioInicial !== undefined) return false;
    const token = leerToken();
    establecerToken(token);
    return token !== null;
  });
  const [aviso, setAviso] = useState<string | null>(null);

  // Valida el token guardado al montar
  useEffect(() => {
    if (!cargando) return;
    const control = new AbortController();
    obtenerUsuarioActual(control.signal)
      .then((u) => setUsuario(u))
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (esApiError(e) && e.status === 401) guardarToken(null);
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [cargando]);

  // 401 en cualquier petición: limpiar y avisar
  useEffect(
    () =>
      alExpirarSesion(() => {
        guardarToken(null);
        setUsuario(null);
        setAviso('Tu sesión expiró. Inicia sesión de nuevo.');
        queryClient.clear();
      }),
    [queryClient],
  );

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const r = await login({ email, password });
    guardarToken(r.token);
    setAviso(null);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await logout();
    } catch {
      // aunque falle, la sesión local se cierra
    }
    guardarToken(null);
    setUsuario(null);
    queryClient.clear();
  }, [queryClient]);

  const valor = useMemo<ValorAuth>(
    () => ({ usuario, cargando, aviso, iniciarSesion, cerrarSesion }),
    [usuario, cargando, aviso, iniciarSesion, cerrarSesion],
  );

  return <ContextoAuth value={valor}>{children}</ContextoAuth>;
}
