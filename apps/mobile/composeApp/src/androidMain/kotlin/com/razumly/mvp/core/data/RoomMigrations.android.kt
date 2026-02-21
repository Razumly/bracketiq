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

private val migrationSql80To81 = listOf(
    "ALTER TABLE `Event` DROP COLUMN `fieldType`",
    "ALTER TABLE `Field` DROP COLUMN `type`",
)

private val migrationSql81To82 = listOf(
    "ALTER TABLE `Event` ADD COLUMN `divisionDetails` TEXT NOT NULL DEFAULT '[]'",
)

private val migrationSql82To83 = listOf(
    "ALTER TABLE `Event` ADD COLUMN `noFixedEndDateTime` INTEGER NOT NULL DEFAULT 0",
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
