-- StayPilot RLS lockdown.
-- Server code uses the service_role key, which bypasses RLS. Enabling RLS
-- with no policies = deny-all for the anon key, which is exactly what we want.
-- Re-run is safe.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
