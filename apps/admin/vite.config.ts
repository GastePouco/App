import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Painel administrativo — aplicação separada do app das pessoas, de propósito.
 *
 * Duas razões: o código do painel não vai junto no pacote que o consumidor
 * baixa (nem deve), e o deploy é separável — o painel pode ficar atrás de uma
 * rede fechada sem prender o app público junto.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    allowedHosts: true,
    proxy: {
      '/v1': {
        target: process.env.API_URL ?? 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
