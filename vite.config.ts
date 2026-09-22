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
      // needs no CORS-shaped special case that exists only in development — and
      // so the session cookie, which is same-origin, works here exactly as it
      // will anywhere else.
      proxy: hubProxy(env.PIHOME_HUB_ORIGIN ?? DEFAULT_HUB_ORIGIN),
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
 * Forward the hub's paths. Nothing is added on the way out.
 *
 * This used to attach `PIHOME_RELAY_API_KEY`, which made development work with no
 * account and is why it was there. It also made the role on that account mean
 * nothing: the hub admits a valid relay key to every route, so a `viewer` reaching
 * it through this proxy was authorised by the key and could switch a mains circuit
 * the hub would otherwise have refused them.
 *
 * The browser logs in for itself now. `pihome-hub-admin create <name>` on the hub
 * is what gets you an account; there is no longer a way to skip that, deliberately
 * — a development mode that grants more than production is a development mode that
 * hides exactly the bugs this client exists to avoid.
 */
function hubProxy(target: string): Record<string, ProxyOptions> {
  const options: ProxyOptions = { target, changeOrigin: true }
  return Object.fromEntries(HUB_PATHS.map((path) => [path, options]))
}
