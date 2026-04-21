-- StayPilot schema (idempotent). Safe to re-run.
-- Use the Supabase SQL editor: Dashboard → SQL → New query → paste → Run.
-- For a fresh project, run 01, 02, 03 in order.

------------------------------------------------------------------------------
-- Enums
------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'RECEPTIONIST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'HOLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('NEW', 'CANCEL', 'IMPORT', 'CHECKIN', 'CHECKOUT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "User" (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  email text UNIQUE NOT NULL,
  "passwordHash" text NOT NULL,
  name text NOT NULL,
  role "UserRole" NOT NULL DEFAULT 'ADMIN',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Property" (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "externalBookingId" integer,
  "externalBeds24Id" integer,
  name text NOT NULL,
  "entranceCode" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Room" (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  code text UNIQUE NOT NULL,
  entrance text NOT NULL,
  label text NOT NULL,
  capacity integer NOT NULL,
  beds text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  "bookingHotelId" integer,
  "bookingRoomId" integer,
  "bookingName" text,
  "beds24PropertyId" integer,
  "beds24RoomId" integer,
  "propertyId" text REFERENCES "Property"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Reservation" (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "externalRef" text,
  "guestName" text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text,
  "roomCode" text NOT NULL,
  "roomId" text NOT NULL REFERENCES "Room"(id),
  "startDate" timestamptz NOT NULL,
  "endDate" timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'Direct',
  notes text,
  status "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
  color text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Notification" (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  type "NotificationType" NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "IntegrationCredential" (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  provider text UNIQUE NOT NULL,
  values jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SyncEvent" (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  provider text NOT NULL,
  direction text NOT NULL,
  status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  id text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "actorId" text REFERENCES "User"(id),
  action text NOT NULL,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  before jsonb,
  after jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

------------------------------------------------------------------------------
-- Indexes
------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Reservation_status_dates_idx"
  ON "Reservation" (status, "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "Reservation_roomId_idx"
  ON "Reservation" ("roomId");
CREATE INDEX IF NOT EXISTS "Reservation_externalRef_idx"
  ON "Reservation" ("externalRef");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx"
  ON "Notification" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SyncEvent_createdAt_idx"
  ON "SyncEvent" ("createdAt" DESC);
