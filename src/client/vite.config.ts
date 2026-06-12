import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local dev: the ASP.NET Core API runs on http://localhost:5000 (see
// src/api/Properties/launchSettings.json); /api requests are proxied there.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
});
