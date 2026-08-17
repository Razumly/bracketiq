# Room migration evidence

The Android Room migration graph is based on generated schemas, not inferred database
versions. For each historical commit below, the database version declared by Room was exported
with KSP and the resulting JSON was checked to contain that exact version number.

| Version | Historical commit |
| --- | --- |
| 7 | `095de82b` |
| 8 | `ac059e48` |
| 9 | `a5a5b12a` |
| 10 | `9d81f5c4` |
| 11 | `0178109a` |
| 12 | `7287ed84` |
| 13 | `39ec7e35` |
| 14 | `d9ffdc44` |
| 15 | `85539cd2` |
| 16 | `c4e12508` |
| 17 | `fdbaf56f` |
| 18 | `6d2b77c8` |
| 19 | `225634f9` |
| 20 | `80cfac75` |
| 21 | `8a714206` |
| 22 | `cf82089c` |
| 23 | `f0619dbc` |
| 24 | `a7144999` |
| 25 | `8d50a7a0` |
| 28 | `dadf3e22` |
| 29 | `f9bd05db` |
| 30 | `941796a3` |
| 31 | `7f9aa791` |
| 32 | `b6762979` |

Versions 7–25 were exported with `:composeApp:kspDebugKotlinAndroid`; versions 28–32 were
exported with `:core:database:kspDebugKotlinAndroid`, matching the module that owned the Room
database at the respective commit. The fixtures live in
`composeApp/schemas/com.razumly.mvp.core.db.MVPDatabaseService/` and are used by
`RoomMigrationPathTest`.

There is no reachable commit declaring `MVP_DATABASE_VERSION = 26` or `27`. The released graph
therefore uses the evidenced `25 -> 28` edge and deliberately contains no invented 26/27 schemas
or migrations.

For required fields added after a release, migrations rebuild the affected table using the exact
target shape and select a migration-only backfill value. This avoids adding SQLite `DEFAULT`
clauses that are absent from Room's exported target schema.
