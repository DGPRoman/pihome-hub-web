# pihome-hub-web

Web interface for [pihome-hub](https://github.com/DGPRoman/pihome-hub), the HTTP control
plane for a Raspberry Pi wired to relay-switched circuits.

The hub already speaks a small REST API. This is the browser client for it: a page that
shows every relay and lets you switch one without reaching for `curl`.

> **Status: early.** The build, type checker and test runner are in place. The API client
> and relay UI land next — see [Roadmap](#roadmap).

## Design notes

**The hub is the source of truth, not this app.** Relay state lives on the Pi. The client
reads it and asks for changes; it never keeps a private idea of which circuits are on.

**Strict types, matching the backend.** The hub type-checks under `mypy --strict`. This
side runs TypeScript with `strict` plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`, so the client is not the loose half of the pair.

**Styles are scoped by default.** Every component owns a `.module.css` file; only design
tokens and a few element defaults are global. Class names cannot collide, and deleting a
component deletes its styles with it.

**Nothing secret ships to the browser.** Vite inlines every `VITE_`-prefixed variable into
the bundle, which makes it readable by anyone who opens devtools. The hub's API keys are
not build-time configuration, and this app will never treat them as such.

## Quick start

No Raspberry Pi required — the hub runs against its mock backend on a laptop.

```bash
git clone https://github.com/DGPRoman/pihome-hub-web.git
cd pihome-hub-web

npm install
npm run dev
```

Then open <http://127.0.0.1:5173>.

To talk to a running hub, start it first (see the hub's own quick start). `npm run dev`
proxies `/v1` and `/health` to `http://127.0.0.1:5002`, so requests stay same-origin and
the app needs no CORS-shaped special case. Point it elsewhere with
`PIHOME_HUB_ORIGIN=http://pi.local:5002 npm run dev`.

## Development

```bash
npm run typecheck      # type-check (strict)
npm test               # test once
npm run test:watch     # test on change
npm run build          # type-check, then produce dist/
```

## Project layout

```
src/
├── main.tsx           mounts React onto #root
├── App.tsx            application shell
├── App.module.css     styles scoped to App
└── styles/
    └── global.css     design tokens and element defaults
index.html             the page Vite serves and builds
vite.config.ts         build, dev proxy and test configuration
```

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Vite build, strict TypeScript, Vitest and Testing Library | ✅ done |
| 2 | Typed API client, relay list, error and loading states | next |
| 3 | Relay switching, optimistic updates, polling | |
| 4 | Authentication against the hub's API key | |
| 5 | Sensor readings and automation rules | |

## License

[MIT](LICENSE)
