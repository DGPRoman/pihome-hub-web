# pihome-hub-web

Web interface for [pihome-hub](https://github.com/DGPRoman/pihome-hub), the HTTP control
plane for a Raspberry Pi wired to relay-switched circuits.

The hub speaks a small REST API. This is the browser client for it: a page that shows every
relay and switches it, without reaching for `curl`.

> **Status: early.** Reading and switching relays works, with polling, optimistic writes and
> honest failure states. Authentication and sensors come next — see [Roadmap](#roadmap).

## Design notes

**The hub is the source of truth, not this app.** Relay state lives on the Pi. The client
reads it and asks for changes; it never keeps a private idea of which circuits are on. Every
type describing a relay is readonly, so that stays true by construction.

**Server state is a cache, not application state.** Almost everything this app displays
belongs to the hub and changes without asking — its automation rules fire on sensor
readings, and someone else may be holding a phone. That is a caching problem, so it is
handled by a cache: TanStack Query owns the relay data, its freshness, its polling and its
retries. A general-purpose store would mean writing invalidation, deduplication and rollback
by hand inside it.

**Responses are validated, not asserted.** TypeScript types are erased at runtime, so
asserting a shape onto parsed JSON only silences the compiler — a hub on a different
version, or a captive portal answering with a login page, would surface as `undefined`
somewhere deep in a component. The client checks each field and builds its own objects, so
unrecognised data cannot ride along. Both request functions are held to one failure type, so
a query error always really is a `HubError`.

**Writes name the state they want.** Switching uses `PUT /v1/relays/{id}` with the desired
state rather than the hub's `POST /toggle`, even though a switch is conceptually a toggle.
Toggling is not idempotent: two clicks that race, or one request retried after a timeout,
leave the circuit wherever the requests happened to interleave. Naming the wanted state makes
a replay harmless, which matters more than brevity when the far end closes a mains circuit.

**A switch moves before the hub confirms.** The cache is written first and reconciled after,
so pressing a switch feels immediate. The write is undone from a snapshot if the hub refuses,
in-flight reads are cancelled first so a stale poll cannot spring the switch back, and the
list is re-read either way — a success is still a guess until the hub says otherwise.

**Failures say what happened, and never discard something true.** A stopped hub, a rejected
key and a malformed body are distinguishable, both to code and on screen. Nothing renders an
empty list to mean "we could not tell". A poll that fails over data already on screen shows a
warning above the last known state rather than blanking a working list.

**Strict types, matching the backend.** The hub type-checks under `mypy --strict`. This side
runs TypeScript with `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`,
and lints with type-aware rules, so the client is not the loose half of the pair.

**Styles are scoped by default.** Every component owns a `.module.css` file; only design
tokens and a few element defaults are global. Class names cannot collide, and deleting a
component deletes its styles with it. State is never carried by colour alone, and focus is
always visible.

**Nothing secret ships to the browser.** Vite inlines every `VITE_`-prefixed variable into
the bundle, which makes it readable by anyone who opens devtools. The hub's API key is not
build-time configuration and is never treated as such: in development the dev-server proxy
attaches it in Node, after the browser's request has already been made. That claim rests on a
naming convention, which a rename could break silently, so CI builds with a canary key and
fails if it finds the value anywhere in `dist/`.

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

To see and switch real relay state, start the hub first (see its own quick start) and copy its
relay key into `.env`:

```bash
grep PIHOME_RELAY_API_KEY ../pihome-hub/.env
```

`npm run dev` proxies `/v1` and `/health` to `http://127.0.0.1:5002`, attaching that key on
the way out. Requests therefore stay same-origin and carry no credential from the browser, so
the app needs no CORS-shaped special case that would exist only in development. Point it at
another hub with `PIHOME_HUB_ORIGIN` — see [`.env.example`](.env.example).

Leaving the key unset is a useful thing to try: the page should report that the hub rejected
it, not show an empty list.

## Development

```bash
npm run format         # format
npm run lint           # lint, with type-aware rules
npm run typecheck      # type-check (strict)
npm test               # test once
npm run test:watch     # test on change
npm run build          # type-check, then produce dist/
```

CI runs the lot on every push, and the tests on Node 22 and 24.

The browser does not type-check. Vite strips types and serves JavaScript, so a page can run
perfectly while `npm run typecheck` fails — which is why it is a separate command and not
folded into `dev`.

Linting is type-aware, which is the reason it is worth running alongside the compiler: rules
that read the type checker catch a promise nobody awaited, or a `switch` over a union that
quietly stopped being exhaustive. Neither is visible from syntax alone. Formatting is
Prettier's job and correctness is ESLint's, so the two are not configured to overlap.

## Project layout

```
src/
├── main.tsx                    mounts React, provides the query client
├── App.tsx                     application shell
├── queryClient.ts              cache, polling and retry policy; error type registration
├── api/
│   ├── types.ts                Relay — mirrors the hub's v1 schema
│   ├── errors.ts               HubError and its closed set of causes
│   └── relays.ts               GET and PUT, with runtime validation
├── hooks/
│   ├── queryKeys.ts            cache keys, shared by query and mutation
│   ├── useRelays.ts            the relay read
│   └── useSetRelay.ts          the relay write, optimistic with rollback
├── components/
│   ├── RelayPanel.tsx          loading, failure, stale, empty or list
│   ├── RelayList.tsx           the list itself
│   └── RelayRow.tsx            one relay, as an accessible switch
├── styles/
│   └── global.css              design tokens and element defaults
└── testing/
    └── renderWithQuery.tsx     render helper providing a fresh cache
index.html                      the page Vite serves and builds
vite.config.ts                  build, dev proxy and test configuration
eslint.config.js                lint rules, type-aware over src and config
public/favicon.svg              theme-aware favicon
.github/workflows/ci.yml        format, lint, types, tests, build
```

Each component sits beside its own `.module.css` and `.test.tsx`.

## Roadmap

| Phase | Scope                                                                        | Status  |
| ----- | ---------------------------------------------------------------------------- | ------- |
| 1     | Vite build, strict TypeScript, Vitest and Testing Library                    | ✅ done |
| 2     | Typed API client, relay list, loading and failure states                     | ✅ done |
| 3     | ESLint, Prettier and CI                                                      | ✅ done |
| 4     | Relay switching, optimistic writes, polling                                  | ✅ done |
| 5     | Authentication against the hub's API key in production                       | next    |
| 6     | Sensor readings and automation rules — the hub serves both since its phase 4 |         |
| 7     | Users, roles and device administration                                       |         |

Phases 5 and 7 need the hub to grow first: it authenticates with two static API keys today
and has no notion of a user, a role or a session.

## License

[MIT](LICENSE)
