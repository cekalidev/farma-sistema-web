// Primero: configura Zod sin eval (CSP) antes de que otro módulo cree esquemas
import './lib/zodSinEval';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './index.css';

// MSW antes de renderizar, solo con VITE_API_MOCKS=todo (demo sin backend).
// Comparación estática: si no es 'todo', el build elimina MSW del bundle.
async function prepararMocks(): Promise<void> {
  if (import.meta.env.VITE_API_MOCKS !== 'todo') return;
  const { iniciarMocks } = await import('./mocks/browser');
  await iniciarMocks();
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
