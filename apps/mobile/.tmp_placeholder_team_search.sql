SELECT id, name
FROM "VolleyBallTeams"
WHERE name ILIKE 'Place Holder%'
ORDER BY "updatedAt" DESC
LIMIT 100;