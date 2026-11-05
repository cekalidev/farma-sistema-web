import { z } from 'zod';
import { describe, expect, it } from 'vite-plus/test';
import './zodSinEval';

describe('zodSinEval', () => {
  it('activa jitless (sin new Function, compatible con la CSP)', () => {
    expect(z.config().jitless).toBe(true);
  });
});
