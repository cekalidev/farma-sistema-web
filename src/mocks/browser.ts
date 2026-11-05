import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** Demo sin backend (VITE_API_MOCKS=todo): MSW responde toda la API. */
export function iniciarMocks() {
  const worker = setupWorker(...handlers);
  return worker.start({
    // Recursos estáticos (JS, CSS, fuentes) siguen su curso sin avisos
    onUnhandledFrame: 'bypass',
    quiet: true,
  });
}
