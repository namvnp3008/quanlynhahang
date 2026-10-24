/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VIETQR_BANK_BIN?: string;
  readonly VITE_VIETQR_ACCOUNT_NO?: string;
  readonly VITE_VIETQR_ACCOUNT_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
