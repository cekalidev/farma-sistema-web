/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_MOCKS?: 'parcial' | 'todo' | 'no';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
