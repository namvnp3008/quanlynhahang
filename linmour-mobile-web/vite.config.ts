/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/app': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
      },
      '/system': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
      },
      '/product': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
      },
      '/restaurant': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
      },
      '/order': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
      },
      '/file': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
      },
      '/dataAnaly': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
      },
      '/websocket': {
        target: 'http://127.0.0.1:12800',
        ws: true,
        changeOrigin: true,
        headers: {
          Origin: 'http://localhost:5173',
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
