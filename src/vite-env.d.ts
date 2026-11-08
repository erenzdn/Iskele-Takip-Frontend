/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SIGNING_SECRET?: string;
  readonly VITE_SIGNING_ENABLED?: string;
  readonly VITE_SESSION_IDLE_MINUTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
