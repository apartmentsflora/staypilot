-- ──────────────────────────────────────────────────────────────────────────
-- Room-code migration: match Beds24 canonical names 1-to-1 with an
-- entrance prefix (41 or 39). Run ONCE on production Supabase.
--
-- Strategy: wrap the whole rename in a single transaction so either all 18
-- codes flip or nothing does. Reservation.roomCode + Reservation.roomId FKs
-- are preserved because roomId points to Room.id (a uuid), not to code.
-- Room.code IS the string that changes.
--
-- Dependencies: Reservation.roomCode is a DENORMALIZED column (string copy
-- of Room.code) — it needs the same rewrite so calendar queries still resolve.
--
-- Two special cases:
--   "41-2" (hyphen)       → Апартамент 41-2 — disambiguates from studio "41.2" (dot)
--   "Двустаен партер"     → ground-floor apartment at entrance 39; Beds24 label has
--                            no numeric prefix so we use the Bulgarian phrase verbatim.
-- ──────────────────────────────────────────────────────────────────────────

BEGIN;

-- First, rename on the Reservation.roomCode denormalized copy.
-- Conditioned by BOTH old code AND the beds24RoomId (via Room join) so we
-- never mismatch a reservation to a different room with a colliding old code.

-- Entrance 41
UPDATE "Reservation" r SET "roomCode" = '41.4.2'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666851;
UPDATE "Reservation" r SET "roomCode" = '41.3'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666848;
UPDATE "Reservation" r SET "roomCode" = '41.2'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666850;
UPDATE "Reservation" r SET "roomCode" = '41.4.1'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666852;
UPDATE "Reservation" r SET "roomCode" = '41-2'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666849;
UPDATE "Reservation" r SET "roomCode" = '41.1.2'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666855;
UPDATE "Reservation" r SET "roomCode" = '41.1.1'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666853;
-- 41.0.1 keeps its code — no-op.
UPDATE "Reservation" r SET "roomCode" = 'Двустаен партер'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666854;

-- Entrance 39
UPDATE "Reservation" r SET "roomCode" = '39.2.4.2'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666863;
UPDATE "Reservation" r SET "roomCode" = '39.2.4.3'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666859;
UPDATE "Reservation" r SET "roomCode" = '39.2.4.1'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666857;
UPDATE "Reservation" r SET "roomCode" = '39.1.5'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666865;
UPDATE "Reservation" r SET "roomCode" = '39.1.3'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666858;
UPDATE "Reservation" r SET "roomCode" = '39.1.3а'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666864;
-- 39.0.1 keeps its code — no-op.
UPDATE "Reservation" r SET "roomCode" = '39.2.5'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666860;
UPDATE "Reservation" r SET "roomCode" = '39.5.5'
  FROM "Room" rm WHERE rm.id = r."roomId" AND rm."beds24RoomId" = 666861;

-- Now rename Room.code itself. Keyed by beds24RoomId so a second run is a no-op.
-- Entrance 41
UPDATE "Room" SET code = '41.4.2',           "updatedAt" = now() WHERE "beds24RoomId" = 666851;
UPDATE "Room" SET code = '41.3',             "updatedAt" = now() WHERE "beds24RoomId" = 666848;
UPDATE "Room" SET code = '41.2',             "updatedAt" = now() WHERE "beds24RoomId" = 666850;
UPDATE "Room" SET code = '41.4.1',           "updatedAt" = now() WHERE "beds24RoomId" = 666852;
UPDATE "Room" SET code = '41-2',             "updatedAt" = now() WHERE "beds24RoomId" = 666849;
UPDATE "Room" SET code = '41.1.2',           "updatedAt" = now() WHERE "beds24RoomId" = 666855;
UPDATE "Room" SET code = '41.1.1',           "updatedAt" = now() WHERE "beds24RoomId" = 666853;
UPDATE "Room" SET code = 'Двустаен партер',  "updatedAt" = now() WHERE "beds24RoomId" = 666854;

-- Entrance 39
UPDATE "Room" SET code = '39.2.4.2',         "updatedAt" = now() WHERE "beds24RoomId" = 666863;
UPDATE "Room" SET code = '39.2.4.3',         "updatedAt" = now() WHERE "beds24RoomId" = 666859;
UPDATE "Room" SET code = '39.2.4.1',         "updatedAt" = now() WHERE "beds24RoomId" = 666857;
UPDATE "Room" SET code = '39.1.5',           "updatedAt" = now() WHERE "beds24RoomId" = 666865;
UPDATE "Room" SET code = '39.1.3',           "updatedAt" = now() WHERE "beds24RoomId" = 666858;
UPDATE "Room" SET code = '39.1.3а',          "updatedAt" = now() WHERE "beds24RoomId" = 666864;
UPDATE "Room" SET code = '39.2.5',           "updatedAt" = now() WHERE "beds24RoomId" = 666860;
UPDATE "Room" SET code = '39.5.5',           "updatedAt" = now() WHERE "beds24RoomId" = 666861;

-- Verify: every Room should have code starting with 41 or 39, OR be "Двустаен партер".
-- This query should return ZERO rows after a clean run.
SELECT code, "beds24RoomId"
FROM "Room"
WHERE code !~ '^(41|39)' AND code <> 'Двустаен партер';

COMMIT;
