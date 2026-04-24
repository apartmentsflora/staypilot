-- StayPilot seed data (idempotent).
-- Admin user:  admin@staypilot.local  /  StayPilot2026!
-- 18 rooms across Entrance 39 and Entrance 41.
-- 2 properties with Beds24 + Booking.com external IDs.

------------------------------------------------------------------------------
-- Admin user
-- Hash is bcrypt of "StayPilot2026!" with cost 10.
------------------------------------------------------------------------------
INSERT INTO "User" (email, "passwordHash", name, role)
VALUES (
  'admin@staypilot.local',
  '$2a$10$BqYmb3bbgcHzTWeWVX/PyOma/6tZ5WNqEaxkLSKtgzEMomD39IrUy',
  'Администратор',
  'ADMIN'
)
ON CONFLICT (email) DO UPDATE
  SET "passwordHash" = EXCLUDED."passwordHash",
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      "updatedAt" = now();

------------------------------------------------------------------------------
-- Properties (two entrances)
------------------------------------------------------------------------------
INSERT INTO "Property" (name, "entranceCode", "externalBookingId", "externalBeds24Id")
VALUES
  ('Flora & Lazur · Вход 39', '39', 2310023, 320506),
  ('Flora & Lazur · Вход 41', '41', 2248792, 320505)
ON CONFLICT DO NOTHING;

------------------------------------------------------------------------------
-- Rooms (18 total). Use UPSERT on unique code.
------------------------------------------------------------------------------
WITH p39 AS (SELECT id FROM "Property" WHERE "entranceCode" = '39' LIMIT 1),
     p41 AS (SELECT id FROM "Property" WHERE "entranceCode" = '41' LIMIT 1)
INSERT INTO "Room" (code, entrance, label, capacity, beds,
                    "bookingHotelId", "bookingRoomId", "beds24PropertyId", "beds24RoomId", "propertyId")
VALUES
  -- Entrance 39 (new Beds24-matching codes)
  ('39.0.1',   '39', 'Собствен двор',      3, '2 отделни + фотьойл', 2310023, 231002306, 320506, 666862, (SELECT id FROM p39)),
  ('39.1.3',   '39', 'Тераса',              2, '2 отделни легла',    2310023, 231002302, 320506, 666858, (SELECT id FROM p39)),
  ('39.1.3а',  '39', 'Малко студио',        2, 'Спалня',             2310023, 231002308, 320506, 666864, (SELECT id FROM p39)),
  ('39.1.5',   '39', 'Тераса',              4, '4 отделни легла',    2310023, 231002309, 320506, 666865, (SELECT id FROM p39)),
  ('39.2.4.1', '39', 'Апартамент',          4, 'Спалня + диван',     2310023, 231002301, 320506, 666857, (SELECT id FROM p39)),
  ('39.2.4.2', '39', 'Тераса',              2, '2 отделни легла',    2310023, 231002307, 320506, 666863, (SELECT id FROM p39)),
  ('39.2.4.3', '39', 'Най-малкото студио',  2, '2 отделни легла',    2310023, 231002303, 320506, 666859, (SELECT id FROM p39)),
  ('39.2.5',   '39', 'Без тераса',          3, '2 отделни + фотьойл', 2310023, 231002304, 320506, 666860, (SELECT id FROM p39)),
  ('39.5.5',   '39', 'Без тераса',          3, '2 отделни + фотьойл', 2310023, 231002305, 320506, 666861, (SELECT id FROM p39)),
  -- Entrance 41 (new Beds24-matching codes)
  --   Двустаен партер keeps its Beds24 literal label as code.
  --   41-2 (hyphen) is the Apartment — distinguishes from Studio "41.2" (dot).
  ('41.0.1',           '41', 'Собствен двор',             2, '2 отделни легла',   2248792, 224879209, 320505, 666856, (SELECT id FROM p41)),
  ('Двустаен партер',  '41', 'Двустаен партер',            4, 'Спалня + 2 отделни', 2248792, 224879207, 320505, 666854, (SELECT id FROM p41)),
  ('41.1.1',           '41', 'Тераса',                    2, '2 отделни легла',   2248792, 224879206, 320505, 666853, (SELECT id FROM p41)),
  ('41.1.2',           '41', 'По-голямо студио',          2, '2 отделни легла',   2248792, 224879208, 320505, 666855, (SELECT id FROM p41)),
  ('41-2',             '41', 'Апартамент 41-2',           4, 'Спалня + диван',    2248792, 224879202, 320505, 666849, (SELECT id FROM p41)),
  ('41.2',             '41', 'Стая 41-2',                 2, '2 отделни легла',   2248792, 224879203, 320505, 666850, (SELECT id FROM p41)),
  ('41.3',             '41', 'Стая 41-3',                 3, '3 отделни легла',   2248792, 224879201, 320505, 666848, (SELECT id FROM p41)),
  ('41.4.1',           '41', 'Малко студио, море',        2, 'Спалня',            2248792, 224879205, 320505, 666852, (SELECT id FROM p41)),
  ('41.4.2',           '41', 'Стая 41-4-2',               3, '3 отделни легла',   2248792, 224879204, 320505, 666851, (SELECT id FROM p41))
ON CONFLICT (code) DO UPDATE
  SET entrance         = EXCLUDED.entrance,
      label            = EXCLUDED.label,
      capacity         = EXCLUDED.capacity,
      beds             = EXCLUDED.beds,
      "bookingHotelId" = EXCLUDED."bookingHotelId",
      "bookingRoomId"  = EXCLUDED."bookingRoomId",
      "beds24PropertyId" = EXCLUDED."beds24PropertyId",
      "beds24RoomId"   = EXCLUDED."beds24RoomId",
      "propertyId"     = EXCLUDED."propertyId",
      "updatedAt"      = now();
