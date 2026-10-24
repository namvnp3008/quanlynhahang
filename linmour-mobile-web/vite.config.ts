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
    proxy: {
      '/app': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
      },
      '/system': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
      },
      '/product': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
      },
      '/restaurant': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
      },
      '/order': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
      },
      '/file': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
      },
      '/dataAnaly': {
        target: 'http://127.0.0.1:12800',
        changeOrigin: true,
      },
      '/websocket': {
        target: 'http://127.0.0.1:12800',
        ws: true,
        changeOrigin: true,
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
