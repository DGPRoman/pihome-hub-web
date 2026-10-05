# pihome-hub-web

Web interface for [pihome-hub](https://github.com/DGPRoman/pihome-hub), the HTTP control
plane for a Raspberry Pi wired to relay-switched circuits.

The hub speaks a small REST API. This is the browser client for it: a page that switches the
relays, shows what the sensors last reported, says whether the hub can still reach the devices
it polls, and lists the rules wiring them together — without reaching for `curl`. For an admin
it is also where people are added: a name and a role, then a QR code and a link that log their
phone in once, with no password to choose or pass on.

> **Status: early.** Relays, sensors, automation rules and devices all read, with polling,
> optimistic writes and honest failure states. The bundle is served by the hub itself and the
> browser logs in for itself, so a role restricts this client and not just a session. An admin
> manages `operator` and `viewer` accounts from here and invites people to them. Admin accounts
> and devices stay declared on the hub, on purpose — see [Roadmap](#roadmap).

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

**A role is shown, not enforced, and never hidden.** The hub decides what an account may
do and would refuse a `viewer`'s write whatever this app did. What the app decides is only
what to render — and it renders the controls either way. A switch that disappears for a
`viewer` claims the feature does not exist, which is indistinguishable from a hub with no
relays configured; one that is visible, marked unavailable and says why tells somebody what
to go and ask for. The reason is written once per section and every control in it points at
that same element, so it is the accessible description of the switch rather than a sentence
somebody has to go and find.

`aria-disabled`, not `disabled`: a disabled control cannot be focused, so the explanation
would be unreachable by exactly the people most likely to need it. The press is refused in
the handler instead, because `aria-disabled` is a claim about a control and not a rule the
browser enforces.

**A refusal is not a failure.** `403` is its own error kind. Collapsed into the generic 4xx
message it read as "the hub rejected the request this app sent" — which told a `viewer` the
app was broken when the app was fine and their role was the answer. The two ask different
things of whoever is reading: one is a bug nobody can act on, the other is solved by asking
an admin. The client's own check can also be out of date — an admin can lower a role while
the page is open, and the hub applies that on the very next request — so both paths exist
and the hub's answer is the one that decides.

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

**An invitation is a link, and opening it does nothing.** An admin adds somebody with a name and
a role, and the hub returns a one-time token, valid for fifteen minutes, that this page shows
as a QR code and a link — both, because a laptop has no camera and a phone standing beside the
screen should not need a link sent to it. The token goes after `#` in `/join#…`, which a
browser never sends to a server, so it reaches no access log, no proxy and no `Referer`. The
page that link opens takes it straight back out of the address bar and this tab's history
entry, and redeems it only when the button is pressed: messaging apps fetch every link they
are sent to draw a preview, and a page that redeemed on load would have the token spent by
that fetch before its person ever saw it. The code is drawn in the browser from the link, so
the token is never an image anything could cache.

While it is on screen the token is held in one place — the people section's state — and not in
the query cache, where every component could read it. The request that fetched it is
collected the moment it is reset, since a finished mutation otherwise keeps its answer for
minutes. Closing the card is the whole of letting it go. The card counts down, and says so
when the hub stops listing the invitation, which is what happens when somebody uses it.

Admin accounts are not invited, changed or deleted from here, and the form never offers the
role: the hub grants it on its console and nowhere else. The people section itself is the one
control this client hides rather than explains. Nobody becomes an admin from here, so there is
nothing a `viewer` could ask for that would change it, and a section explaining that would be
noise — and since the section is not rendered, the hub is not asked for a list it would only
refuse.

**A refused login is not a session ending.** A `401` from anything means the session this
browser held has stopped working, and the cache records that nobody is logged in. Except from
a login: a wrong password or a spent invitation is the hub refusing what was offered, and it
leaves the cookie alone when it does. Those two mutations say so in their `meta`, so following
an expired link while logged in leaves you logged in.

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
pihome-hub-admin create roman --role admin   # prompts for the password, twice
```

Then log in on the page. As an admin you also get the people section, which is how everybody
else gets in: add a name, and open the link it shows in a private window to see what joining
looks like. A link made on `localhost` opens only the device it was made on — the card says
so — so to invite a phone, open the page by the hub's address on your network. `npm run dev` proxies `/v1` and `/health` to
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

The other roles are worth looking at once, and an invitation is the quick way to be one. An
`operator` can switch relays; a `viewer` is shown the same house with the same switches, each
marked unavailable and saying why — which is what somebody given the wrong role will see, and
it should tell them what to ask for.

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
│   ├── types.ts                Relay, Sensor and Device — the app's own shapes
│   ├── errors.ts               HubError and its closed set of causes
│   ├── http.ts                 one request path, one failure type
│   ├── relays.ts               GET and PUT, one relay or all, with runtime validation
│   ├── sensors.ts              GET, with runtime validation and wire mapping
│   ├── devices.ts              GET, the devices the hub polls
│   ├── automation.ts           GET, the configured rules
│   ├── session.ts              log in by password or invitation, and out
│   └── users.ts                accounts and their invitations, for an admin
├── hooks/
│   ├── queryKeys.ts            cache keys, shared by query and mutation
│   ├── useMayChangeTheHouse.ts the role, as the one question the UI asks of it
│   ├── useRelays.ts            the relay read
│   ├── useSetRelay.ts          the relay write, optimistic with rollback
│   ├── useSetAllRelays.ts      the same, for every relay at once
│   ├── useSensors.ts           the sensor read
│   ├── useDevices.ts           the device read
│   ├── useRules.ts             the automation read
│   ├── useSession.ts           who this browser is, and the ways in and out
│   ├── useAccounts.ts          the account list and every write to it
│   └── useNow.ts               a clock for a countdown, and nothing else
├── components/
│   ├── DataPanel.tsx           loading, failure, stale and empty, once for all sections
│   ├── ErrorBoundary.tsx       contains a rendering crash to one section
│   ├── RelayPanel.tsx          the relay section
│   ├── AllOffButton.tsx        opens every relay, for leaving the house
│   ├── RelayList.tsx           the relay list
│   ├── RelayRow.tsx            one relay, as an accessible switch
│   ├── SensorPanel.tsx         the sensor section
│   ├── SensorList.tsx          the sensor list
│   ├── SensorRow.tsx           one sensor: readings, freshness, or neither
│   ├── DevicePanel.tsx         the device section
│   ├── DeviceList.tsx          the device list
│   ├── DeviceRow.tsx           one device: where it is, and what it last said
│   ├── RulePanel.tsx           the automation section
│   ├── RuleList.tsx            the rule list
│   ├── RuleRow.tsx             one rule, in a sentence
│   ├── PeoplePanel.tsx         the people section, for an admin
│   ├── PersonRow.tsx           one account, and what may be done to it from here
│   ├── AddPersonForm.tsx       a name and a role, then straight to the invitation
│   ├── InvitationCard.tsx      the code, the link and the time left on them
│   ├── QrCode.tsx              a QR code, drawn in the browser
│   └── JoinPage.tsx            where an invitation link lands
├── lib/
│   ├── roles.ts                what each role may do, ranked as the hub ranks it
│   ├── freshness.ts            how far a single sensor reading can be trusted
│   ├── devices.ts              where a device stands with the hub, in four answers
│   ├── join.ts                 the join link, and reading one out of the address
│   ├── qr.ts                   a link as a QR matrix, as one SVG path
│   ├── usernames.ts            the hub's rule for a name, mirrored for the form
│   └── time.ts                 relative times and countdowns, as pure functions
├── styles/
│   ├── global.css              design tokens and element defaults
│   ├── list.module.css         the row container every section shares
│   └── button.module.css       the secondary button every section uses
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
| 8     | Users, roles and devices                                         | ✅ done |

Sensors moved ahead of authentication because authentication turned out to have nothing to
build against. Both halves of Phase 7 have since arrived: the hub issues sessions — `POST
/v1/session` sets a cookie, `GET` and `DELETE` report and clear it — and it serves static
files from `PIHOME_WEB_ROOT`, which is what the deployment above points at.

Phase 8 has started with the half that had something to build against. The hub enforces
roles on `/v1` — a read takes any account, a write takes `operator` or `admin` — so the UI
reflects the role it was given, and a refusal reads as a refusal rather than as a broken
app. The dev proxy no longer attaches an API key either, which was the other half of that
problem: a `viewer` reaching the hub that way was authorised by the key and not by their
role.

Devices followed, as far as the hub allows. `GET /v1/devices` reports each declared device
and how the last poll went, so the page says whether the hub can still reach the board across
a PC's power header — and, when it cannot, what it last said and how long ago. The hub keeps
that reading across a failed poll on purpose, and showing it with its age rather than hiding
it is the same principle as the sensor panel's: absent, stale and zero are three different
things.

People came last, once the hub had routes for them. An admin lists every account, moves one
between `operator` and `viewer`, disables, re-enables and deletes it, and adds somebody by
invitation — the hub makes an account with no password anybody holds, and the link is the way
in. A new phone, or a session that ran out, is another invitation to the same account.

Two things are left out on purpose rather than waiting on anything. **Admin accounts** are
the hub console's: no route raises an account to `admin` or changes one, so this client offers
neither. **Devices** are declared in a file on the hub, and `/v1/devices` only reads it back —
declaring rather than discovering is what stops an announcement aiming the hub at an address
nobody chose, so administering devices from here would be changing that rule, not adding a
feature.

## License

[MIT](LICENSE)
