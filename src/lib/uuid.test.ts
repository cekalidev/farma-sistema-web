import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { nuevoUuid, uuidV4Aleatorio } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('nuevoUuid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('genera UUID v4 con getRandomValues si no hay randomUUID (contexto no seguro)', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: original.getRandomValues.bind(original),
    } as unknown as Crypto);
    const a = nuevoUuid();
    const b = nuevoUuid();
    expect(a).toMatch(V4);
    expect(b).toMatch(V4);
    expect(a).not.toBe(b);
  });

  it('usa randomUUID si existe', () => {
    expect(nuevoUuid()).toMatch(V4);
    expect(uuidV4Aleatorio()).toMatch(V4);
  });
});
