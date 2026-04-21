-- Add cots (кошара) column to Reservation table
-- Cots are for children up to 3 years old, charged at €25/night per cot
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "cots" integer NOT NULL DEFAULT 0;
