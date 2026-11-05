import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vite-plus/test';
import { establecerToken } from '../api/client';
import { server } from '../mocks/server';
import { reiniciarMocks } from './reiniciarMocks';

// jsdom no implementa <dialog>.showModal/close: polyfill mínimo (open + eventos close/cancel)
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.show = function show(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function close(this: HTMLDialogElement, valor?: string) {
      if (!this.hasAttribute('open')) return;
      if (valor !== undefined) this.returnValue = valor;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    // Escape en un diálogo abierto → evento `cancel` (cancelable), como el navegador
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const abiertos = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
      const dialogo = abiertos[abiertos.length - 1];
      if (!dialogo) return;
      const cancel = new Event('cancel', { cancelable: true });
      if (dialogo.dispatchEvent(cancel)) dialogo.close();
    });
  }
}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  establecerToken(null);
  reiniciarMocks();
});

afterAll(() => server.close());
