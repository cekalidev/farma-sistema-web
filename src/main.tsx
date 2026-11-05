import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import type { ModoMocks } from './mocks/handlers';
import './index.css';

function modoMocks(): ModoMocks {
  const valor = (import.meta.env.VITE_API_MOCKS ?? '').trim();
  if (valor === 'todo' || valor === 'parcial' || valor === 'no') return valor;
  return import.meta.env.DEV ? 'parcial' : 'no';
}

// MSW antes de renderizar; en producción solo si VITE_API_MOCKS=todo
async function prepararMocks(): Promise<void> {
  // Comparación estática: el build de producción elimina MSW si no es 'todo'
  if (import.meta.env.PROD && import.meta.env.VITE_API_MOCKS !== 'todo') return;
  const modo = modoMocks();
  if (modo === 'no') return;
  const { iniciarMocks } = await import('./mocks/browser');
  await iniciarMocks(modo);
}

const raiz = document.getElementById('root');
if (!raiz) throw new Error('Falta el elemento #root');

void prepararMocks().finally(() => {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
