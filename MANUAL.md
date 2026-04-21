# StayPilot · Operating Manual

This document is the source of truth for running, deploying, and debugging
StayPilot in production. Read it once end-to-end.

---

## 1. Architecture at a glance

- **Framework:** Next.js 14 (App Router), React 18, TypeScript, Tailwind.
- **Hosting:** Netlify, using the official `@netlify/plugin-nextjs` runtime
  (server-side rendering + edge middleware + API routes).
- **Database:** Supabase (Postgres 17).
  - Server-only code uses the **service_role** key and bypasses RLS.
  - RLS is enabled on every app table, so the anon key is useless to an
    attacker. If the anon key leaks, data is still protected.
- **Auth:** custom JWT in an `sp_session` HTTP-only cookie, signed with
  `AUTH_SECRET`. Enforced in `middleware.ts` on every `/dashboard/*` and
  most `/api/*` routes.
- **Integrations:** Beds24 (primary PMS), Booking.com (via Beds24 channel
  manager), direct Website webhook, plus a public `/api/availability`
  GET endpoint for the hotel's website to show free rooms.

Room → external ID mapping lives in `lib/rooms.ts` **and** in the database
(`Room."bookingHotelId"`, `Room."beds24PropertyId"`, etc). The file in
`lib/rooms.ts` is the source of truth for room colours and for the fast
webhook lookup.

---

## 2. Environment variables (the only thing that can break deploy)

Set these in **Netlify → Site settings → Environment variables**. The
preflight script checks they all exist before every deploy, so a missing
variable fails loud instead of producing a broken site.

| Variable | Scope | Purpose | Where to get it |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase REST URL | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Client-safe key. Useless without RLS policies (there are none). | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Bypasses RLS. Master key. | Supabase → Settings → API → service_role |
| `AUTH_SECRET` | Server only | Signs session JWTs. Must be ≥ 24 chars. App refuses to start otherwise. | Generate: `openssl rand -hex 32` |

Current values in Netlify can be listed by running:
```
npx netlify-cli env:list --site e78fdeb9-e1bb-4255-ac34-22bfbabe5fa4
```

### If you rotate `AUTH_SECRET`
- All existing sessions are invalidated. Users must log in again.

### If you rotate `SUPABASE_SERVICE_ROLE_KEY`
- You must update the Netlify env var **and** redeploy. The preflight script
  catches missing keys but not stale ones.

---

## 3. Deploy workflow

### Normal deploy
Run `deploy-mac-linux.sh` (or `deploy-windows.bat`). It handles login,
preflight, build, deploy, and health verification.

### Behind the scenes
```
npm install
npx netlify-cli login           # skipped if already logged in
node scripts/preflight.mjs       # env var check
npx netlify-cli deploy --prod --build --site <SITE_ID>
node scripts/healthcheck.mjs     # hits /api/health
```

### Why `--build`
The old deploy script used `--dir .next`, which **uploads the raw build
output** and **skips the Netlify Next.js plugin**. That would break SSR,
middleware, and API routes — the whole app goes 404. `--build` runs the
build on Netlify's servers with the plugin active, which is the supported
path for App Router + middleware.

### Git-based auto-deploy (optional, recommended long-term)
If you push the project to a Git repo and connect it to this Netlify site,
every `git push` deploys automatically and the CLI is no longer needed.
Env vars stay where they are.

---

## 4. Database

### First-time setup on a fresh Supabase project
Open Supabase Dashboard → SQL Editor → New query, then run in order:

1. `db/01_enums_and_tables.sql` — creates enums, tables, indexes.
2. `db/02_rls_lockdown.sql` — enables RLS on every app table.
3. `db/03_seed.sql` — inserts admin user + 18 rooms + 2 properties.

All three files are **idempotent** — safe to re-run if you're unsure what's
already applied.

### Current state (confirmed 2026-04-15)
- All 8 app tables exist with RLS enabled.
- 18 rooms seeded (Entrance 39 × 9, Entrance 41 × 9).
- 1 admin user: `admin@staypilot.local` / `StayPilot2026!`.

### Rotating the admin password
Generate a new bcrypt hash (cost 10), then:
```sql
UPDATE "User"
   SET "passwordHash" = '$2a$10$NEW_HASH_HERE',
       "updatedAt"    = now()
 WHERE email = 'admin@staypilot.local';
```
Quick hash generator on any machine with Node:
```
node -e "console.log(require('bcryptjs').hashSync('NEW_PASSWORD', 10))"
```

### Adding a user
```sql
INSERT INTO "User" (email, "passwordHash", name, role)
VALUES ('manager@staypilot.local',
        '$2a$10$HASH_OF_THEIR_PASSWORD',
        'Име Фамилия',
        'MANAGER');
```
Roles: `ADMIN`, `MANAGER`, `RECEPTIONIST` (enforced by the enum).

---

## 5. Integrations

### Beds24 — primary PMS (TWO-WAY sync)
- Entrances → Property IDs: `320506` (Entrance 39), `320505` (Entrance 41).

#### Inbound (Beds24 → StayPilot)
- In Beds24 → Settings → Notifications → Webhooks, set URL to
  `https://staypilot-flora-lazur.netlify.app/api/integrations/beds24/webhook`.
- **Optional auth:** save a secret in the DB:
  ```sql
  INSERT INTO "IntegrationCredential" (provider, values)
  VALUES ('beds24', jsonb_build_object('webhookSecret', 'YOUR_SECRET'))
  ON CONFLICT (provider) DO UPDATE SET values = EXCLUDED.values;
  ```
  Then configure Beds24 to send header `X-Beds24-Secret: YOUR_SECRET`.
  If the DB has no secret, the webhook accepts unauthenticated requests
  (matches the original behaviour).

#### Outbound (StayPilot → Beds24)
Any reservation **created inside StayPilot** (walk-in, phone, voice, or
website direct booking that arrived through the website webhook) is now
pushed up to Beds24 automatically, so the same night is blocked on
Booking.com within seconds via the Beds24 channel manager.

The outbound push also fires on edit (PATCH) and cancel (DELETE) — it
maps our internal status (`CONFIRMED` / `HOLD` / `CANCELLED`) to Beds24's
(`confirmed` / `request` / `cancelled`).

**Setup (one-time):**
1. In Beds24, go to **Settings → Account → API**. Generate a
   **refresh token** (sometimes labelled "long life token") with the
   `write` scope on the properties `320505` and `320506`.
2. In StayPilot open **Settings**, paste the refresh token into the
   field labelled *"API КЛЮЧ ЗА BEDS24"*. The UI kept the old
   `apiKey` label on purpose (design was not to change) — internally
   that field is stored as `refreshToken`.
3. The field below the input will show `● Конфигуриран` once the next
   call to `/api/integrations/beds24/test` succeeds.

**How the access token is handled:**
- On the first outbound call, the server exchanges the refresh token for
  a short-lived access token at
  `https://beds24.com/api/v2/authentication/token` and caches it in
  `IntegrationCredential.values.accessToken` together with
  `accessTokenExpiresAt`.
- The cache is reused for 23 hours with a 5-minute safety margin.
- Saving a *new* refresh token in Settings automatically wipes the
  cached access token so the next call re-exchanges.

**Idempotency / avoiding duplicates:**
- Every local row has an `externalRef`. When Beds24 accepts our push we
  save `externalRef = "beds24-<bookingId>"`.
- The inbound webhook also key-matches on `externalRef`, so when Beds24
  echoes our own booking back to us it is recognised and **not**
  re-inserted — no bounce-back duplicates.

**Connectivity check:**
- `GET /api/integrations/beds24/test` (authenticated) returns
  `{ "ok": true }` on success or `{ "ok": false, "reason": "..." }`
  with HTTP 502 on failure. The Settings page uses this for the
  live status dot.

**Troubleshooting outbound failures:**
- Every outbound attempt (success or fail) writes a row to `SyncEvent`
  with `provider='beds24'` and `direction='OUTBOUND'`. Inspect:
  ```sql
  SELECT "createdAt", status, payload
    FROM "SyncEvent"
   WHERE provider='beds24' AND direction='OUTBOUND'
   ORDER BY "createdAt" DESC LIMIT 20;
  ```
- `status='ERROR'` rows carry the upstream error in `payload.error`.
- Outbound failures are **best-effort** — they never block the user's
  request. A failed push is logged and the local row still exists, so
  the operator can retry from the Reservation detail dialog.

### Booking.com — via Beds24 channel manager
- Hotel IDs: `2310023` (Entrance 39), `2248792` (Entrance 41).
- Bookings flow `Booking.com → Beds24 → StayPilot`. The Booking.com webhook
  is only needed if you use a direct integration; normally nothing to do.

### Website — direct bookings
- URL: `https://staypilot-flora-lazur.netlify.app/api/integrations/website/webhook`
- The website must send header `X-StayPilot-Key: <apiKey>` where `<apiKey>` is
  whatever you saved in the Settings page ("API КЛЮЧ ЗА УЕБСАЙТА").
- Payload:
  ```json
  {
    "roomCode": "1.3",
    "guestName": "Ivan Petrov",
    "phone": "+359...",
    "email": "ivan@example.com",
    "startDate": "2026-06-10",
    "endDate":   "2026-06-15",
    "notes": "late arrival"
  }
  ```
- Returns `409` if the room is already booked for those dates.

### Public availability endpoint
GET `https://staypilot-flora-lazur.netlify.app/api/availability?start=2026-06-01&end=2026-06-05`
→ returns the list of rooms that are free for that range (used by the hotel
website's "show available rooms" UI).

---

## 6. Troubleshooting

### 🔴 Login always fails ("Невалиден email или парола")
- Verify `AUTH_SECRET` is set and ≥ 24 chars in Netlify env.
- Verify the admin user exists:
  ```sql
  SELECT email, role FROM "User" WHERE email = 'admin@staypilot.local';
  ```
- If you rotated the password in Supabase, the new bcrypt hash must be a
  bcrypt hash of the *plain* password. Use the node one-liner above.

### 🔴 After login I get redirected to /login
- Session cookie JWT could not be verified. Usually means `AUTH_SECRET`
  changed between requests, or the cookie `secure` flag mismatches the
  protocol. On production (`NODE_ENV=production`), the cookie is `secure`;
  you must use HTTPS.

### 🔴 Dashboard loads but shows 0 rooms / empty calendar
- Service role key probably isn't reaching the server. Call:
  ```
  curl https://staypilot-flora-lazur.netlify.app/api/health
  ```
  Look at the `env` and `missing` fields in the response. The healthcheck
  tells you exactly which env var Netlify is missing.

### 🔴 `/api/health` returns 503
- Either the DB is unreachable (Supabase project paused?) or an env var is
  missing. Response body lists the missing keys.

### 🔴 Webhook POSTs return 200 but no reservation appears
- Look at the `SyncEvent` table — every webhook call logs a row:
  ```sql
  SELECT * FROM "SyncEvent" ORDER BY "createdAt" DESC LIMIT 20;
  ```
  The `status` column will be `RECEIVED`, `PROCESSED`, or `ERROR`. An
  `ERROR` row's `payload.error` column has the reason.
- Check that `propertyId:roomId` (Beds24) or `hotel_id:room_id` (Booking.com)
  match the keys in `lib/rooms.ts`. Unmapped IDs get logged but ignored.

### 🔴 Netlify deploy build fails
- First place to look: the Netlify deploy log (build output). Common
  causes:
  - `NODE_VERSION` in `netlify.toml` wasn't honored → set it to `"20"`.
  - `npm install` fails because of peer-dep conflicts → `NPM_FLAGS =
    "--legacy-peer-deps"` handles this; don't remove it.

### 🔴 `netlify deploy` says "site not linked"
- Run `npx netlify-cli link --id e78fdeb9-e1bb-4255-ac34-22bfbabe5fa4`
  once. The deploy scripts pass `--site <id>` so this shouldn't matter, but
  if your shell cached a conflicting `.netlify/state.json`, delete it.

---

## 7. Security notes

- The service_role key is a master key. Do NOT paste it into a browser,
  into a slack message, or into any file committed to git. It is scoped to
  Netlify server environment only.
- The anon key is safe to ship in the browser bundle. RLS prevents it from
  doing anything useful. Even so, `.env.example` does not ship a real one —
  replace with your project's value.
- The login route rate-limits itself only implicitly (via bcrypt cost 10).
  If you expose the app to the public internet long term, put Netlify's
  rate limiting or a WAF in front.

---

## 7b. Voice reservations (Bulgarian)

The **+** button on the calendar opens a dialog with a microphone. Press
it, speak in Bulgarian, and the fields fill in automatically. The parser
lives in `lib/voice.ts` and is shared by the dialog — the calendar page
itself does no parsing (single source of truth).

### What it understands
- **Room codes**: `стая 1.3`, `апартамент 4.1`, `номер 39 0 1` (spoken digits), `3.9A`, `третия етаж` disambiguation via explicit "стая" prefix.
- **Relative dates**: `днес`, `утре`, `вдругиден`, `вчера`, `след 3 дни`, `следващата събота`, `уикенда`, `за уикенд`.
- **Absolute dates**:
  - `15.06`, `15.06.2026`, `15/06/2026`
  - `15 юни`, `15 юни 2026`, `петнадесети юни` (ordinal, spelled-out)
  - `20-ти юни`, `1-ви май`, `3-ти`, `четвърти` (bare ordinal → current month)
- **Ranges**: `от 1-ви до 10-ти май`, `от 15.06 до 20.06`, `между петнадесети и двадесети юни`. When the first leg has no month but the second does, the month is inherited from leg 2.
- **Durations**: `за 3 нощувки`, `за 2 седмици`, `за една нощ`, `за уикенд` → auto-fills the end date from the start date.
- **Phraseology**:
  - Arrival: `пристига`, `настанява се`, `идва`, `ще е при нас от`
  - Departure: `заминава`, `тръгва`, `освобождава`, `напуска`
  - Reservation verbs: `резервирай`, `направи резервация`, `запази стая`
- **Guest count (grammatical)**: `двама`, `трима`, `четирима`, `петима`, `шестима` OR explicit unit: `2 души`, `3 гости`, `4 човека`. Crucially rejects `за 2 седмици` — that is a duration, not a guest count.
- **Phone**: `+359 88 123 4567` literal, `нула осемдесет и осем...` spelled-out, `плюс три пет девет...`, `тире`/`точка` as separators.
- **Name**: `името е ...`, `гостът се казва ...`, or the first capitalised 2-word span when no explicit phrase is used.
- **Notes**: `бележка: ...`, `коментар: ...`.

### Cyrillic word-boundary fix
JavaScript's `\b` doesn't work on Cyrillic because letters outside
ASCII are treated as non-word characters. The parser uses Unicode
look-arounds instead: `(?<![\p{L}\d])X(?![\p{L}\d])` with the `/u`
flag. Any new tokenization must follow the same pattern.

### Regression samples
`lib/voice.ts` exports `__VOICE_SAMPLES__` — 7 representative phrases
covering the surface area above. A light smoke test can be written as:
```js
import { parseVoice, __VOICE_SAMPLES__ } from '@/lib/voice';
for (const s of __VOICE_SAMPLES__) console.log(parseVoice(s, 2026));
```

### Known limitations
- Works in Chrome / Edge only (`webkitSpeechRecognition`). Safari and
  Firefox fall back to "type it yourself" — the dialog still works.
- The speech recogniser is `bg-BG`; heavy English code-switching may
  degrade accuracy.
- "следващия петък" without further context always resolves to the
  next Friday strictly after today.

---

## 8. What changed vs. the original ZIP

### Bug fixes
- `supabase.ts`: the anon key was being used for server writes. Replaced
  with a lazy service_role client that fails loud if the key is missing.
- `auth.ts` + `middleware.ts`: removed the insecure `AUTH_SECRET` fallback.
  A weak or missing secret now fails every protected request closed.
- `reservations POST`: added zod validation, date normalization,
  end-after-start check, and made notification/sync-event inserts
  best-effort so a logging failure no longer fails the user's request.
- `reservations [id] PATCH`: now validates the patch body (strict zod) and
  normalizes dates the same way as POST.
- `notifications DELETE`: replaced broken `.neq("id", "")` with a reliable
  `.gte("createdAt", epoch)`.
- `beds24 / booking / website` webhooks: stricter date validation,
  optional shared-secret auth, SyncEvent ERROR rows on failure.
- `/api/health`: now reports which env vars are missing and returns 503
  when degraded, so the deploy script can detect broken deploys.
- `/api/availability`: stricter query param validation.
- `middleware.ts`: replaced the loose `startsWith` public-path match with
  exact + prefix matches, so `/login-anything` cannot sneak through.

### Infrastructure fixes
- `netlify.toml`: removed `publish = ".next"` (the plugin handles it,
  setting it manually can break SSR). Added security response headers.
- Deploy scripts: now use `netlify deploy --prod --build`, which runs the
  full Next.js build on Netlify (plugin active). The old `--dir .next`
  invocation would have shipped a broken app.
- Added `scripts/preflight.mjs` — checks env vars on Netlify **before**
  deploy.
- Added `scripts/healthcheck.mjs` — hits `/api/health` **after** deploy.
- Pinned `netlify-cli` in devDependencies so deploys don't depend on
  network fetches.

### Database
- Enabled RLS on all 8 app tables (`User`, `Property`, `Room`,
  `Reservation`, `Notification`, `IntegrationCredential`, `SyncEvent`,
  `AuditLog`).
- Added indexes for the hot queries (`Reservation` by status+dates,
  `Reservation` by roomId and externalRef, `Notification` and
  `SyncEvent` by createdAt).
- Shipped `db/01_enums_and_tables.sql`, `db/02_rls_lockdown.sql`,
  `db/03_seed.sql` as idempotent reference migrations.

### Two-way sync + real voice parsing (this revision)
- `lib/beds24.ts` — new outbound Beds24 client (`createBeds24Booking`,
  `updateBeds24Booking`, `cancelBeds24Booking`, `beds24Ping`) with
  lazy access-token caching and `SyncEvent` OUTBOUND logging.
- `reservations POST / PATCH / DELETE` — now push to Beds24 after the
  local write, best-effort (failures don't fail the user request).
- `integrations/settings` — merges existing row when saving (so the
  `apiKey`/`refreshToken` field can be updated without losing the
  webhook secret) and never leaks cached access tokens to the browser.
- `integrations/beds24/test` — new authenticated endpoint for the
  Settings page's live-status dot.
- `lib/voice.ts` — pulled the Bulgarian speech parser out of the
  calendar page into a standalone module, expanded it to handle
  ordinals (`двадесет и пети`), weekday-prefixed relative dates,
  grammatical guest forms (`двама/трима/петима`), phraseological
  arrival/departure verbs, spelled-out digits, `тире`/`точка`
  separators, and range harmonization. Cyrillic word boundaries use
  Unicode look-arounds with the `/u` flag throughout.
