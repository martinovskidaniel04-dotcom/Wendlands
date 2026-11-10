/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// A mesa é servida como arquivos estáticos; o servidor online (pasta servidor/)
// também consegue servir a pasta dist/ gerada por este build.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
  test: {
    environment: 'node',
    include: ['testes/**/*.teste.ts'],
  },
});
