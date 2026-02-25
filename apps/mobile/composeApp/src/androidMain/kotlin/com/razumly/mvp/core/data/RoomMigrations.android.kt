package com.razumly.mvp.core.data

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlin.use

val MIGRATION_80_81 = object : Migration(80, 81) {
    override fun migrate(db: SupportSQLiteDatabase) {
        migrationSql80To81.forEach(db::execSQL)
    }

    override fun migrate(connection: SQLiteConnection) {
        migrationSql80To81.forEach { sql ->
            connection.prepare(sql).use { statement ->
                statement.step()
            }
        }
    }
}

val MIGRATION_81_82 = object : Migration(81, 82) {
    override fun migrate(db: SupportSQLiteDatabase) {
        migrationSql81To82.forEach(db::execSQL)
    }

    override fun migrate(connection: SQLiteConnection) {
        migrationSql81To82.forEach { sql ->
            connection.prepare(sql).use { statement ->
                statement.step()
            }
        }
    }
}

val MIGRATION_82_83 = object : Migration(82, 83) {
    override fun migrate(db: SupportSQLiteDatabase) {
        migrationSql82To83.forEach(db::execSQL)
    }

    override fun migrate(connection: SQLiteConnection) {
        migrationSql82To83.forEach { sql ->
            connection.prepare(sql).use { statement ->
                statement.step()
            }
        }
    }
}

val MIGRATION_83_84 = object : Migration(83, 84) {
    override fun migrate(db: SupportSQLiteDatabase) {
        migrationSql83To84.forEach(db::execSQL)
    }

    override fun migrate(connection: SQLiteConnection) {
        migrationSql83To84.forEach { sql ->
            connection.prepare(sql).use { statement ->
                statement.step()
            }
        }
    }
}

val MIGRATION_84_85 = object : Migration(84, 85) {
    override fun migrate(db: SupportSQLiteDatabase) {
        migrationSql84To85.forEach { sql ->
            runCatching {
                db.execSQL(sql)
            }
        }
    }

    override fun migrate(connection: SQLiteConnection) {
        migrationSql84To85.forEach { sql ->
            runCatching {
                connection.prepare(sql).use { statement ->
                    statement.step()
                }
            }
        }
    }
}

val MIGRATION_87_88 = object : Migration(87, 88) {
    override fun migrate(db: SupportSQLiteDatabase) {
        migrationSql87To88.forEach { sql ->
            runCatching {
                db.execSQL(sql)
            }
        }
    }

    override fun migrate(connection: SQLiteConnection) {
        migrationSql87To88.forEach { sql ->
            runCatching {
                connection.prepare(sql).use { statement ->
                    statement.step()
                }
            }
        }
    }
}

val MIGRATION_88_89 = object : Migration(88, 89) {
    override fun migrate(db: SupportSQLiteDatabase) {
        migrationSql88To89.forEach { sql ->
            runCatching {
                db.execSQL(sql)
            }
        }
    }

    override fun migrate(connection: SQLiteConnection) {
        migrationSql88To89.forEach { sql ->
            runCatching {
                connection.prepare(sql).use { statement ->
                    statement.step()
                }
            }
        }
    }
}

private val migrationSql80To81 = listOf(
    "ALTER TABLE `Event` DROP COLUMN `fieldType`",
    "ALTER TABLE `Field` DROP COLUMN `type`",
)

private val migrationSql81To82 = listOf(
    "ALTER TABLE `Event` ADD COLUMN `divisionDetails` TEXT NOT NULL DEFAULT '[]'",
)

private val migrationSql82To83 = listOf(
    "ALTER TABLE `Event` ADD COLUMN `noFixedEndDateTime` INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE `Team` ADD COLUMN `headCoachId` TEXT",
    """
    UPDATE `Event`
    SET `noFixedEndDateTime` = 1
    WHERE UPPER(COALESCE(`eventType`, '')) IN ('LEAGUE', 'TOURNAMENT')
      AND `start` = `end`
    """.trimIndent(),
)

private val migrationSql83To84 = listOf(
    "ALTER TABLE `MatchMVP` ADD COLUMN `locked` INTEGER NOT NULL DEFAULT 0",
)

private val migrationSql84To85 = listOf(
    "ALTER TABLE `Team` ADD COLUMN `managerId` TEXT",
    "ALTER TABLE `Team` ADD COLUMN `headCoachId` TEXT",
    "ALTER TABLE `Team` ADD COLUMN `coachIds` TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE `Team` ADD COLUMN `parentTeamId` TEXT",
    "ALTER TABLE `Team` ADD COLUMN `profileImageId` TEXT",
    "ALTER TABLE `Team` ADD COLUMN `sport` TEXT",
    """
    UPDATE `Team`
    SET
        `seed` = COALESCE(`seed`, 0),
        `division` = COALESCE(`division`, 'OPEN'),
        `wins` = COALESCE(`wins`, 0),
        `losses` = COALESCE(`losses`, 0),
        `captainId` = COALESCE(`captainId`, ''),
        `coachIds` = COALESCE(`coachIds`, '[]'),
        `playerIds` = COALESCE(`playerIds`, '[]'),
        `pending` = COALESCE(`pending`, '[]'),
        `teamSize` = COALESCE(`teamSize`, 0)
    """.trimIndent(),
)

private val migrationSql87To88 = listOf(
    "ALTER TABLE `MatchMVP` ADD COLUMN `team1Seed` INTEGER",
    "ALTER TABLE `MatchMVP` ADD COLUMN `team2Seed` INTEGER",
)

private val migrationSql88To89 = listOf(
    "ALTER TABLE `Event` ADD COLUMN `teamRefsMaySwap` INTEGER",
)
