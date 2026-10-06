import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // also listen on the LAN so phones/tablets on the same Wi-Fi can open it
    proxy: { '/api': 'http://localhost:3001' },
  },
});
