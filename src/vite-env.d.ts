/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SIGNING_SECRET?: string;
  readonly VITE_SIGNING_ENABLED?: string;
  readonly VITE_SYNCFUSION_LICENSE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
