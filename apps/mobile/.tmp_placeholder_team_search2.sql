SELECT id, name
FROM "VolleyBallTeams"
WHERE name ILIKE 'PlaceHolder%'
ORDER BY "updatedAt" DESC
LIMIT 100;