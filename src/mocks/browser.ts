import { setupWorker } from 'msw/browser';
import { handlersPorModo, type ModoMocks } from './handlers';

export function iniciarMocks(modo: ModoMocks) {
  const worker = setupWorker(...handlersPorModo(modo));
  return worker.start({
    // En modo parcial lo no simulado pasa al backend real sin avisos
    onUnhandledFrame: 'bypass',
    quiet: true,
  });
}
