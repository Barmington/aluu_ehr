import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// During development, /api requests are proxied to the Express backend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/aluu_ehr/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
