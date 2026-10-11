/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL. Empty string = same origin (nginx proxies /api). Default: http://localhost:8000 */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
