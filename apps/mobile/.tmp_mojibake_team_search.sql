SELECT id, name
FROM "VolleyBallTeams"
WHERE name ILIKE '%â€“%' OR name ILIKE '%–%' OR name ILIKE '%Place Holder%' OR name ILIKE '%Placeholder%'
ORDER BY "updatedAt" DESC
LIMIT 50;