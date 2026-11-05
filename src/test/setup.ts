import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vite-plus/test';
import { establecerToken } from '../api/client';
import { server } from '../mocks/server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  establecerToken(null);
});

afterAll(() => server.close());
