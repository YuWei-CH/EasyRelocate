import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Unify env vars at repo root `.env` for both frontend + backend.
  envDir: '..',
  server: {
    // Some environments map `localhost` -> `::1` only; binding explicitly to IPv4 avoids hanging loads.
    host: '127.0.0.1',
  },
})
