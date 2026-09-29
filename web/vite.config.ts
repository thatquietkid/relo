import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8085,
    host: true,
  },
  preview: {
    port: 8085,
    host: true,
  },
});
