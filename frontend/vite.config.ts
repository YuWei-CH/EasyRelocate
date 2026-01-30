import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Unify env vars at repo root `.env` for both frontend + backend.
  envDir: '..',
})
