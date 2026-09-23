# pihome-hub-web

Web interface for [pihome-hub](https://github.com/DGPRoman/pihome-hub), the HTTP control
plane for a Raspberry Pi wired to relay-switched circuits.

The hub speaks a small REST API. This is the browser client for it: a page that switches the
relays, shows what the sensors last reported, and lists the rules wiring the two together —
without reaching for `curl`.

> **Status: early, and development-only.** Relays, sensors and automation rules work, with
> polling, optimistic writes and honest failure states. There is no production deployment yet:
> the hub serves no
> static files, so nothing hosts this bundle, and the browser is authenticated only by the dev
> proxy. Both are the next problems — see [Roadmap](#roadmap).

## Design notes

**The hub is the source of truth, not this app.** Relay state lives on the Pi. The client
reads it and asks for changes; it never keeps a private idea of which circuits are on. Every
type describing a relay is readonly, so that stays true by construction.

**Server state is a cache, not application state.** Everything this app displays belongs to
the hub and changes without asking — its automation rules fire on sensor readings, devices
push whenever they wake, and someone else may be holding a phone. That is a caching problem,
so it is handled by a cache: TanStack Query owns the data, its freshness, its polling and its
retries. A general-purpose store would mean writing invalidation, deduplication and rollback
by hand inside it. There is no client state worth a store yet, and none is invented in advance.

**The wire format stops at the API layer.** The hub speaks snake_case and sends timestamps as
ISO strings. Both are converted once, in the parser, so nothing downstream handles `last_seen`
or has to remember that a particular string is really a date. A `Date` that failed to parse is
a rejected response, not an "Invalid Date" rendered on screen.

**Absent, stale and zero are three different things.** A configured sensor that has never
reported, one whose last reading is older than its window, and one reporting no motion all
look alike if nullable readings are flattened into defaults. They are kept distinct, because an
unplugged sensor must not read as a quiet room.

**Responses are validated, not asserted.** TypeScript types are erased at runtime, so
asserting a shape onto parsed JSON only silences the compiler — a hub on a different
version, or a captive portal answering with a login page, would surface as `undefined`
somewhere deep in a component. The client checks each field and builds its own objects, so
unrecognised data cannot ride along. Every request function is held to one failure type, so a
query error always really is a `HubError`.

**Writes name the state they want.** Switching uses `PUT /v1/relays/{id}` with the desired
state rather than the hub's `POST /toggle`, even though a switch is conceptually a toggle.
Toggling is not idempotent: two clicks that race, or one request retried after a timeout,
leave the circuit wherever the requests happened to interleave. Naming the wanted state makes
a replay harmless, which matters more than brevity when the far end closes a mains circuit.

**The bulk control only goes one way.** The hub takes either state for every relay at
once, but only "all off" is offered. One button that closes every mains circuit in the
house serves no moment anyone actually has, while switching everything off on the way out
is the reason the control exists at all. It also goes out as `PUT` with the wanted state
rather than the hub's toggle-all, which inverts each relay independently — replaying that
against a half-lit house lands somewhere different every time.

**A switch moves before the hub confirms.** The cache is written first and reconciled after,
so pressing a switch feels immediate. The write is undone from a snapshot if the hub refuses,
in-flight reads are cancelled first so a stale poll cannot spring the switch back, and the
list is re-read either way — a success is still a guess until the hub says otherwise.

**A refusal and an unreadable answer are not the same thing.** A write the hub _accepted_ and
then answered with a body the parser rejects is not evidence that nothing happened: the
circuit moved, and only the confirmation was lost. Undoing it there put the switch in its old
position while the mains was in the new one, and the obvious response — press it again — is a
second write. That case is reported as a status rather than an error, the value stands, the
switch is marked as not settled until the hub speaks again, and a re-read decides it.

**Failures say what happened, and never discard something true.** A stopped hub, a rejected
key, a body the hub refused and an answer that did not come from the hub at all are
distinguishable, both to code and on screen. Every route on the hub answers JSON, so a reply
that is not JSON is a proxy or a captive portal rather than the hub — which for a write means
it never arrived. A status the client does not model says so and names the number, instead of
collapsing a 403, a 409 and a gateway's own page into one sentence. Nothing renders an empty
list to mean "we could not tell". A poll that fails over data already on screen shows a
warning above the last known state rather than blanking a working list.

**A crash stays in the section it happened in.** A component that throws while rendering
unmounts the entire tree above it, so one bad row would otherwise take the page down and
the relays with it. Each section renders inside an error boundary, which reports the
reason in place and keeps its heading, leaving the sections beside it usable — being
unable to read the automation rules is no reason to lose the switch for the porch light.
It does not clear itself when the next poll arrives: re-rendering whatever just threw
would loop against a crash that is not transient, so recovery is a button.

**Strict types, matching the backend.** The hub type-checks under `mypy --strict`. This side
runs TypeScript with `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`,
and lints with type-aware rules, so the client is not the loose half of the pair.

**Styles are scoped by default.** Every component owns a `.module.css` file; only design
tokens and a few element defaults are global. Class names cannot collide, and deleting a
component deletes its styles with it. State is never carried by colour alone, and focus is
always visible.

**Nothing secret ships to the browser, and nothing secret is held here at all.** The client
authenticates by logging in: the hub answers with a session token in an `HttpOnly` cookie,
which this code cannot read — a scripting bug here cannot exfiltrate a credential that
outlives the page — and every later request carries it because they are same-origin.

There is no API key in this repository, in the bundle, or in the dev-server proxy. The proxy
used to attach one in Node; it no longer does, for the reason the quick start gives. Vite
inlines every `VITE_`-prefixed variable into the bundle, so "no credential reaches the
browser" would rest on a naming convention if there were a credential to name — CI still
builds with a canary value and fails if it finds it in `dist/`, which now guards against the
mechanism coming back rather than against the one that was there.

A write authenticated by that cookie carries an `X-Pihome-CSRF` header. Any value: the hub
never reads it, and its presence is the whole check, because a page on another origin cannot
set a header like that without a CORS preflight the hub will not answer. `SameSite=Strict` on
the cookie is the first lock on the same door.

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

To see real relay and sensor state, start the hub first (see its own quick start) and give
yourself an account on it:

```bash
pihome-hub-admin create roman --role operator   # prompts for the password, twice
```

Then log in on the page. `npm run dev` proxies `/v1` and `/health` to
`http://127.0.0.1:5002` and adds nothing on the way out, so requests stay same-origin —
which is what lets the session cookie work here exactly as it will anywhere else, and why
the app needs no CORS-shaped special case that would exist only in development. Point it at
another hub with `PIHOME_HUB_ORIGIN` — see [`.env.example`](.env.example).

**There is no way to skip the login, and that is deliberate.** The proxy used to attach the
hub's relay API key, which made development work with no account — and made the role on that
account mean nothing, because the hub admits a valid key to every route. A `viewer` reaching
the hub that way could switch a mains circuit it would otherwise have refused them. A
development mode that grants more than production hides exactly the bugs this client exists
to avoid.

The role you give yourself is worth choosing on purpose. An `operator` can switch relays; a
`viewer` is shown the house and refused every write, which is a useful thing to look at
once.

Logging out, or letting the session expire, should return the page to the login form rather
than leaving a stale house on screen.

A hub with sensors configured but nothing pushed yet shows what an unreported device looks
like. To give it something to report:

```bash
curl -X POST -H "X-API-Key: $SENSOR_KEY" -H 'Content-Type: application/json' \
     -d '{"motion":true,"temperature":18.5}' \
     http://127.0.0.1:5002/v1/sensors/porch-motion/readings
```

The page picks it up on its next poll, without a reload.

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

## Deployment

The hub serves this bundle itself. There is no second web server, no nginx in front and no
CORS: the page and the API are one origin, which is what lets the session cookie work in a
deployment exactly as it does under `npm run dev`.

**Build here, install there.** A Pi Zero has no business running npm, and the output is
byte-for-byte the same either way.

```bash
npm run build
rsync -a --delete dist/ pi:/tmp/pihome-hub-web/
rsync -a deploy/install.sh pi:/tmp/
ssh pi 'sudo /tmp/install.sh /tmp/pihome-hub-web'
```

The script goes over with the bundle rather than being checked out on the Pi: it depends on
nothing else in this repository, and a deployment that needs a git clone on the target is one
more thing to keep in step.

[`deploy/install.sh`](deploy/install.sh) puts the build in `/opt/pihome-hub-web/releases/`
under a timestamp and points `/opt/pihome-hub-web/current` at it. The first install prints
the one line the hub needs:

```
PIHOME_WEB_ROOT=/opt/pihome-hub-web/current
```

Add it to `/etc/pihome-hub/hub.env` and restart the hub once. **Every install after that
needs no restart**, and that is the reason for the symlink rather than a matter of taste:
restarting the hub drives every relay back to its configured initial state, and a light
somebody is standing under is not a deployment detail. The script never edits `hub.env`
itself — that file belongs to pihome-hub, whose own installer writes it, and a package that
edits another's configuration is one that fights it on the next upgrade.

The flip is a `rename(2)` over the symlink rather than `ln -sfn`, which unlinks first: a
request arriving in that window would be a 404 on the front page. Nobody's browser ever sees
an `index.html` naming assets that have already been deleted, because the old release is
still there — the last three are kept, so rolling back is pointing the symlink at the one
before:

```bash
ssh pi 'sudo ln -s /opt/pihome-hub-web/releases/<earlier> /opt/pihome-hub-web/current.incoming \
        && sudo mv -T /opt/pihome-hub-web/current.incoming /opt/pihome-hub-web/current'
```

### What the hub does with it

Everything it does not answer itself is answered by this bundle, and a navigation to a path
with no file behind it gets `index.html` — so a URL held in the address bar survives a
refresh. A _missing asset_ is still a 404: the fallback is conditional on the request
accepting `text/html`, because answering `/assets/index-C7kKkJch.js` with an HTML document
would be served as JavaScript and fail as a syntax error somewhere inside it, which says
nothing about the file being absent.

The hub's own paths are never shadowed. It reads the first segment of every route it
registers and refuses to hand those to the bundle, so a mistyped `/v1` path stays a 404 from
the API rather than becoming a page that makes every route look like it exists.

### Testing the script

Deployment scripts fail where nobody is watching — on a Pi, over ssh, with the previous
bundle already replaced. [`deploy/test-install.sh`](deploy/test-install.sh) therefore runs
the real thing against a throwaway filesystem: a real symlink flip, real pruning, and each
state `hub.env` can be in. CI runs it on every push; locally it wants a container, and
refuses to run without one being implied:

```bash
docker run --rm -v "$PWD:/w:ro" -w /w debian:stable-slim \
    env PIHOME_WEB_DEPLOY_TEST=1 bash deploy/test-install.sh
```

## Project layout

```
src/
├── main.tsx                    mounts React, provides the query client
├── App.tsx                     application shell
├── queryClient.ts              cache, polling and retry policy; error type registration
├── api/
│   ├── types.ts                Relay and Sensor — the app's own shapes
│   ├── errors.ts               HubError and its closed set of causes
│   ├── http.ts                 one request path, one failure type
│   ├── relays.ts               GET and PUT, one relay or all, with runtime validation
│   ├── sensors.ts              GET, with runtime validation and wire mapping
│   └── automation.ts           GET, the configured rules
├── hooks/
│   ├── queryKeys.ts            cache keys, shared by query and mutation
│   ├── useRelays.ts            the relay read
│   ├── useSetRelay.ts          the relay write, optimistic with rollback
│   ├── useSetAllRelays.ts      the same, for every relay at once
│   ├── useSensors.ts           the sensor read
│   └── useRules.ts             the automation read
├── components/
│   ├── DataPanel.tsx           loading, failure, stale and empty, once for all sections
│   ├── ErrorBoundary.tsx       contains a rendering crash to one section
│   ├── RelayPanel.tsx          the relay section
│   ├── AllOffButton.tsx        opens every relay, for leaving the house
│   ├── RelayList.tsx           the relay list
│   ├── RelayRow.tsx            one relay, as an accessible switch
│   ├── SensorPanel.tsx         the sensor section
│   ├── SensorList.tsx          the sensor list
│   ├── SensorRow.tsx           one device: readings, freshness, or neither
│   ├── RulePanel.tsx           the automation section
│   ├── RuleList.tsx            the rule list
│   └── RuleRow.tsx             one rule, in a sentence
├── lib/
│   └── time.ts                 relative times, as a pure function of two instants
├── styles/
│   ├── global.css              design tokens and element defaults
│   └── list.module.css         the row container every section shares
└── testing/
    └── renderWithQuery.tsx     render helper providing a fresh cache
index.html                      the page Vite serves and builds
vite.config.ts                  build, dev proxy and test configuration
eslint.config.js                lint rules, type-aware over src and config
public/favicon.svg              theme-aware favicon
.github/workflows/ci.yml        format, lint, types, tests, build, deployment
deploy/install.sh               install a built bundle on the Pi and flip to it
deploy/test-install.sh          run that against a throwaway filesystem
```

Each component sits beside its own `.test.tsx`, and beside its own `.module.css` unless the
styles are genuinely shared.

## Roadmap

| Phase | Scope                                                            | Status  |
| ----- | ---------------------------------------------------------------- | ------- |
| 1     | Vite build, strict TypeScript, Vitest and Testing Library        | ✅ done |
| 2     | Typed API client, relay list, loading and failure states         | ✅ done |
| 3     | ESLint, Prettier and CI                                          | ✅ done |
| 4     | Relay switching, optimistic writes, polling                      | ✅ done |
| 5     | Sensor readings, staleness, wire-format mapping                  | ✅ done |
| 6     | Automation rules, read-only                                      | ✅ done |
| 7     | Getting this served somewhere, and authenticating a real browser | ✅ done |
| 8     | Users, roles and device administration                           | next    |

Sensors moved ahead of authentication because authentication turned out to have nothing to
build against. Both halves of Phase 7 have since arrived: the hub issues sessions — `POST
/v1/session` sets a cookie, `GET` and `DELETE` report and clear it — and it serves static
files from `PIHOME_WEB_ROOT`, which is what the deployment above points at.

Phase 8 is no longer blocked. The hub enforces roles on `/v1` — a read takes any account, a
write takes `operator` or `admin`, and a cookie-authenticated write carries a CSRF header —
so there are real permissions to build against rather than a role that is only reported. The
dev proxy no longer attaches an API key either, which was the other half of the problem: a
`viewer` reaching the hub that way was authorised by the key and not by their role.

## License

[MIT](LICENSE)
