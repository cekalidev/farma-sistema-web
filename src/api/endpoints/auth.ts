// Autenticación
import { peticion } from '../client';
import type { Envoltorio, RespuestaLogin, Usuario } from '../tipos';

export const authKeys = {
  todo: ['auth'] as const,
  me: () => ['auth', 'me'] as const,
};

export function login(credenciales: { email: string; password: string }): Promise<RespuestaLogin> {
  return peticion<RespuestaLogin>('/auth/login', { method: 'POST', body: credenciales });
}

export async function obtenerUsuarioActual(signal?: AbortSignal): Promise<Usuario> {
  const r = await peticion<Envoltorio<Usuario>>('/auth/me', signal ? { signal } : {});
  return r.data;
}

export function logout(): Promise<void> {
  return peticion<void>('/auth/logout', { method: 'POST' });
}
