// Sesión: token en sessionStorage, usuario desde /auth/me
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const [errorSesion, setErrorSesion] = useState<unknown>(null);
  const cerrandoRef = useRef(false);

  // Valida el token guardado al montar (y en cada reintento)
  useEffect(() => {
    if (!cargando) return;
    const control = new AbortController();
    obtenerUsuarioActual(control.signal)
      .then((u) => setUsuario(u))
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        // Solo un 401 invalida el token; RED/5xx no: se ofrece reintentar
        if (esApiError(e) && e.status === 401) guardarToken(null);
        else setErrorSesion(e);
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
        // Un 401 de una petición en vuelo durante el "Salir" voluntario no es una expiración
        if (!cerrandoRef.current) setAviso('Tu sesión expiró. Inicia sesión de nuevo.');
        queryClient.clear();
      }),
    [queryClient],
  );

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const r = await login({ email, password });
    guardarToken(r.token);
    setAviso(null);
    setErrorSesion(null);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const cerrarSesion = useCallback(async () => {
    cerrandoRef.current = true;
    try {
      await logout();
    } catch {
      // aunque falle (incluido un 401), la sesión local se cierra sin aviso de expiración
    } finally {
      cerrandoRef.current = false;
    }
    guardarToken(null);
    setAviso(null);
    setUsuario(null);
    queryClient.clear();
  }, [queryClient]);

  const reintentarSesion = useCallback(() => {
    setErrorSesion(null);
    setCargando(true);
  }, []);

  const valor = useMemo<ValorAuth>(
    () => ({
      usuario,
      cargando,
      aviso,
      errorSesion,
      iniciarSesion,
      cerrarSesion,
      reintentarSesion,
    }),
    [usuario, cargando, aviso, errorSesion, iniciarSesion, cerrarSesion, reintentarSesion],
  );

  return <ContextoAuth value={valor}>{children}</ContextoAuth>;
}
