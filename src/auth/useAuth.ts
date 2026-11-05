import { useContext } from 'react';
import { ContextoAuth, type ValorAuth } from './contexto';

export function useAuth(): ValorAuth {
  const valor = useContext(ContextoAuth);
  if (!valor) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return valor;
}
