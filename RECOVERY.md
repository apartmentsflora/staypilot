# StayPilot — recovery & deployment checklist

After deploying this zip, work through the list below in order. Nothing below
touches data in the database — everything is either a deploy step or a UI
click inside Beds24.

## 0. What this build changes

Code-only changes (no DB migration required — schema already matched):

- `lib/beds24.ts` and `app/api/integrations/beds24/webhook/route.ts` now
  persist the rotated Beds24 refresh token on every exchange. From this
  deploy forward the token chain self-heals indefinitely — you should
  never have to paste a fresh invite code again unless Beds24 itself
  revokes access manually.
- Beds24 webhook route returns HTTP 200 on internal errors (failure is
  still logged in `SyncEvent`). Beds24 will never silently disable the
  endpoint because it saw a streak of 5xx.
- `lib/notify.ts` suppresses duplicate notifications: identical
  `(type, title, detail)` within the last 30 minutes is dropped. Kills
  the "same 3 new bookings every 2 minutes" push spam.
- `app/api/integrations/website/webhook/route.ts` now accepts both the
  new (`startDate`/`endDate`/`guests`/`email`/`phone`) and legacy
  (`checkin`/`checkout`/`adults`/`guestEmail`/`guestPhone`) Flora field
  names, and the `x-api-key` header in addition to `x-staypilot-key`.
  Website bookings that arrive pre-pushed to Beds24 reuse the Beds24
  booking id as `externalRef`, so the later inbound webhook updates the
  same row instead of duplicating it.

## 1. Deploy

Either drag the zip onto your site in Netlify's deploys tab, or run:

```
cd staypilot && npx netlify-cli@latest deploy --prod
```

Wait for the deploy to go live (typically 60–90 s).

## 2. Re-save the Beds24 webhook URLs

Live data shows no Beds24 webhook has been delivered since 2026-04-18
15:08 UTC, even though Beds24 has had new events to report. Most likely
the URL change in Beds24 didn't fully persist, or delivery got paused.
Re-save it to be sure:

1. Log in to Beds24.
2. **Settings → Marketplace → Webhooks.** Set the URL to
   `https://staypilot3.netlify.app/api/integrations/beds24/webhook`.
   Click **Save** even if the URL is already correct — that re-enables
   delivery if Beds24 paused it.
3. For each Flora property (property ids 322955 and 322959):
   open **Settings → Properties → Access → Booking webhooks**, set the
   same URL, save.
4. Use the **Test** button next to any of the webhook URLs. Expect HTTP
   200. Within a few seconds you should see a new row in Supabase:

   ```sql
   select * from "SyncEvent"
   where provider='beds24' and direction='INBOUND_WEBHOOK'
   order by "createdAt" desc limit 1;
   ```

## 3. Smoke test

Create a throwaway booking via the Beds24 booking page for an unused
room and an arbitrary future date.

- Within ~1 minute you should see a new `Reservation` row in
  Supabase with `externalRef='beds24-<id>'` and a `SyncEvent`
  pair (`RECEIVED` + `PROCESSED`).
- The notification bell in `/dashboard/calendar` should ring exactly
  once — no repeats.
- Cancel the booking from Beds24. The Reservation row flips to
  `status='CANCELLED'`, `cancelledAt` gets populated, and the
  "Анулиране" notification fires once.

## 4. Verify refresh-token self-renewal (optional but recommended)

Before a poll or webhook runs, read the current refreshToken:

```sql
select values->>'refreshToken' as rt, "updatedAt"
from "IntegrationCredential"
where provider='beds24';
```

Copy the value. Trigger a manual sync by opening your dashboard (the
poll fires automatically). Re-read the same row. With this build the
`refreshToken` value should change each time Beds24 rotates — the
chain is self-renewing forever.

## 5. Troubleshooting

If Beds24 inbound webhooks still don't arrive after re-saving the URL
and hitting Test, check Netlify function logs for
`/api/integrations/beds24/webhook` — a 200 from your side but no
matching Beds24 delivery log means the problem is inside Beds24's
dashboard (webhook disabled, property not selected, trigger not
checked). The fix is 100 % inside Beds24 — nothing further to do in
code.
