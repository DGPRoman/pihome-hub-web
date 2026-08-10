# pihome-hub-web

Web interface for [pihome-hub](https://github.com/DGPRoman/pihome-hub), the HTTP control
plane for a Raspberry Pi wired to relay-switched circuits.

The hub speaks a small REST API. This is the browser client for it: a page that shows
every relay and its state without reaching for `curl`.

> **Status: early.** Reading relay state works, with honest loading and failure states.
> Switching relays lands next — see [Roadmap](#roadmap).

## Design notes

**The hub is the source of truth, not this app.** Relay state lives on the Pi. The client
reads it and asks for changes; it never keeps a private idea of which circuits are on.
Every type describing a relay is readonly, so that stays true by construction.

**Responses are validated, not asserted.** TypeScript types are erased at runtime, so
asserting a shape onto parsed JSON only silences the compiler — a hub on a different
version, or a captive portal answering with a login page, would surface as `undefined`
somewhere deep in a component. The client checks each field and builds its own objects, so
unrecognised data cannot ride along.

**One request state, not three booleans.** A `data`/`error`/`isLoading` trio permits states
that cannot happen — data and an error together — and leaves each consumer guessing which
field to trust. Requests are modelled as a tagged union of `loading`, `success` and
`failure` instead, so the compiler refuses to let a component read data it has not
established exists.

**Failures say what happened.** A stopped hub, a rejected key and a malformed body are
distinguishable, both to code and on screen. Nothing renders an empty list to mean "we
could not tell".

**Strict types, matching the backend.** The hub type-checks under `mypy --strict`. This
side runs TypeScript with `strict` plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`, so the client is not the loose half of the pair.

**Styles are scoped by default.** Every component owns a `.module.css` file; only design
tokens and a few element defaults are global. Class names cannot collide, and deleting a
component deletes its styles with it. State is never carried by colour alone.

**Nothing secret ships to the browser.** Vite inlines every `VITE_`-prefixed variable into
the bundle, which makes it readable by anyone who opens devtools. The hub's API key is not
build-time configuration and is never treated as such: in development the dev-server proxy
attaches it in Node, after the browser's request has already been made.

## Quick start

No Raspberry Pi required — the hub runs against its mock backend on a laptop.

```bash
git clone https://github.com/DGPRoman/pihome-hub-web.git
cd pihome-hub-web

npm install
cp .env.example .env
npm run dev
```

Then open <http://127.0.0.1:5173>.

To see real relay state, start the hub first (see its own quick start) and copy its relay
key into `.env`:

```bash
grep PIHOME_RELAY_API_KEY ../pihome-hub/.env
```

`npm run dev` proxies `/v1` and `/health` to `http://127.0.0.1:5002`, attaching that key on
the way out. Requests therefore stay same-origin and carry no credential from the browser,
so the app needs no CORS-shaped special case that would exist only in development. Point it
at another hub with `PIHOME_HUB_ORIGIN` — see [`.env.example`](.env.example).

Leaving the key unset is a useful thing to try: the page should report that the hub rejected
it, not show an empty list.

## Development

```bash
npm run typecheck      # type-check (strict)
npm test               # test once
npm run test:watch     # test on change
npm run build          # type-check, then produce dist/
```

The browser does not type-check. Vite strips types and serves JavaScript, so a page can run
perfectly while `npm run typecheck` fails — which is why it is a separate command and not
folded into `dev`.

## Project layout

```
src/
├── main.tsx                    mounts React onto #root
├── App.tsx                     application shell
├── api/
│   ├── types.ts                Relay — mirrors the hub's v1 schema
│   ├── errors.ts               HubError and its closed set of causes
│   └── relays.ts               GET /v1/relays, with runtime validation
├── hooks/
│   └── useRelays.ts            Async<T>, and the relay read
├── components/
│   ├── RelayPanel.tsx          renders loading, failure, empty or list
│   └── RelayList.tsx           the relays, presentational only
└── styles/
    └── global.css              design tokens and element defaults
index.html                      the page Vite serves and builds
vite.config.ts                  build, dev proxy and test configuration
public/favicon.svg              theme-aware favicon
```

Each component sits beside its own `.module.css` and `.test.tsx`.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Vite build, strict TypeScript, Vitest and Testing Library | ✅ done |
| 2 | Typed API client, relay list, loading and failure states | ✅ done |
| 3 | Relay switching, optimistic updates, refresh and polling | next |
| 4 | Authentication against the hub's API key in production | |
| 5 | Sensor readings and automation rules — the hub serves both since its phase 4 | |
| 6 | Linting, formatting and CI | |

## License

[MIT](LICENSE)
