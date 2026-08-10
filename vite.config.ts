/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Where `npm run dev` forwards API calls. The hub binds loopback by default. */
const HUB_ORIGIN = process.env['PIHOME_HUB_ORIGIN'] ?? 'http://127.0.0.1:5002'

export default defineConfig({
  plugins: [react()],

  server: {
    // The hub is a separate origin, and its own CORS policy is deliberately
    // absent. Proxying in development keeps requests same-origin, so the app
    // is written once and does not need a CORS-shaped special case.
    proxy: {
      '/v1': { target: HUB_ORIGIN, changeOrigin: true },
      '/health': { target: HUB_ORIGIN, changeOrigin: true },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: true,
  },
})
