-- Legacy rows have no authoritative ownership marker.
UPDATE "Divisions"
SET "isSystemGenerated" = false
WHERE "isSystemGenerated" = true;
