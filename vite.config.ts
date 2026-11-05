import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite-plus';

export default defineConfig(({ mode }) => {
  // Lee .env, .env.local y .env.[mode] (el config no los ve en process.env por sí solo)
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Mismo origen: el backend no expone Retry-After ni Idempotent-Replayed por CORS
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    staged: {
      // TS/TSX: formato + Oxlint + tipos y, después, ESLint sin advertencias
      '*.{ts,tsx}': ['vp check --fix', 'eslint --max-warnings=0'],
      '*.{js,mjs,cjs,json,jsonc,css,md,html,yml,yaml}': 'vp check --fix',
    },
    fmt: {
      ignorePatterns: ['dist/**', 'coverage/**', 'public/mockServiceWorker.js', 'pnpm-lock.yaml'],
      singleQuote: true,
      semi: true,
      printWidth: 100,
    },
    lint: {
      ignorePatterns: ['dist/**', 'coverage/**', 'public/mockServiceWorker.js'],
      jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
      rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
      options: { typeAware: true, typeCheck: true },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      maxWorkers: 2,
      css: false,
    },
  };
});
