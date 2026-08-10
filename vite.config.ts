/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

const HUB_PATHS = ['/v1', '/health']
const DEFAULT_HUB_ORIGIN = 'http://127.0.0.1:5002'

export default defineConfig(({ mode }) => {
  // An empty prefix loads every variable, not just the VITE_ ones. That is safe
  // here and nowhere else: this file runs in Node, at build time. Only VITE_
  // variables are inlined into the bundle, so the key read below cannot reach
  // the browser unless someone renames it.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],

    server: {
      // The hub is a separate origin and sends no CORS headers, by design.
      // Proxying keeps requests same-origin, so the client is written once and
      // needs no CORS-shaped special case that exists only in development.
      proxy: hubProxy(env['PIHOME_HUB_ORIGIN'] ?? DEFAULT_HUB_ORIGIN, env['PIHOME_RELAY_API_KEY']),
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      css: true,
    },
  }
})

/**
 * Forward the hub's paths, attaching the API key on the way out.
 *
 * The key belongs to the developer's own hub and stays in Node: the proxy adds
 * the header after the browser's request has already been made, so the app never
 * sees a credential and cannot leak one. Production authentication is a
 * different problem with a different answer — see the roadmap.
 */
function hubProxy(target: string, apiKey: string | undefined): Record<string, ProxyOptions> {
  const options: ProxyOptions = {
    target,
    changeOrigin: true,
    ...(apiKey ? { headers: { 'X-API-Key': apiKey } } : {}),
  }
  return Object.fromEntries(HUB_PATHS.map((path) => [path, options]))
}
