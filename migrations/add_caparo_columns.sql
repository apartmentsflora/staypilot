-- Caparo (deposit) tracking on Reservation.
-- Staff manually mark caparo received + the amount taken. A separate
-- "pending caparo" view lists rows where caparoReceived is false and
-- the reservation is older than 1 day. A reminder push fires once per
-- reservation at the 2-day mark if still pending.

ALTER TABLE "Reservation"
  ADD COLUMN IF NOT EXISTS "caparoReceived"  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "caparoAmount"    numeric,
  ADD COLUMN IF NOT EXISTS "caparoReceivedAt" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "caparoReminderSentAt" timestamp with time zone;

-- Helpful index for the pending-caparo list ("show me every confirmed
-- reservation where no caparo has been recorded yet, oldest first").
CREATE INDEX IF NOT EXISTS "Reservation_pending_caparo_idx"
  ON "Reservation" ("caparoReceived", "status", "createdAt")
  WHERE "caparoReceived" = false AND "status" = 'CONFIRMED';
