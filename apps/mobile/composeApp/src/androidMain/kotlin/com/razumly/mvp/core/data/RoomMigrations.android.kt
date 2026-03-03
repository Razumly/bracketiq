package com.razumly.mvp.core.data

import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlin.use

val MIGRATION_1_2_NO_OP = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // Schema did not change between versions 1 and 2; this satisfies Room's required path.
    }

    override fun migrate(connection: SQLiteConnection) {
        // Schema did not change between versions 1 and 2; this satisfies Room's required path.
    }
}

val MIGRATION_2_3_MATCH_START_NULLABLE = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        migrationSql2To3.forEach(db::execSQL)
    }

    override fun migrate(connection: SQLiteConnection) {
        migrationSql2To3.forEach { sql ->
            connection.prepare(sql).use { statement ->
                statement.step()
            }
        }
    }
}

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

private val migrationSql2To3 = listOf(
    """
    CREATE TABLE IF NOT EXISTS `MatchMVP_new` (
        `matchId` INTEGER NOT NULL,
        `team1Id` TEXT,
        `team2Id` TEXT,
        `team1Seed` INTEGER,
        `team2Seed` INTEGER,
        `eventId` TEXT NOT NULL,
        `refereeId` TEXT,
        `fieldId` TEXT,
        `start` INTEGER,
        `end` INTEGER,
        `division` TEXT,
        `team1Points` TEXT NOT NULL,
        `team2Points` TEXT NOT NULL,
        `setResults` TEXT NOT NULL,
        `side` TEXT,
        `losersBracket` INTEGER NOT NULL,
        `winnerNextMatchId` TEXT,
        `loserNextMatchId` TEXT,
        `previousLeftId` TEXT,
        `previousRightId` TEXT,
        `refereeCheckedIn` INTEGER,
        `teamRefereeId` TEXT,
        `locked` INTEGER NOT NULL,
        `id` TEXT NOT NULL,
        PRIMARY KEY(`id`)
    )
    """.trimIndent(),
    """
    INSERT INTO `MatchMVP_new` (
        `matchId`,
        `team1Id`,
        `team2Id`,
        `team1Seed`,
        `team2Seed`,
        `eventId`,
        `refereeId`,
        `fieldId`,
        `start`,
        `end`,
        `division`,
        `team1Points`,
        `team2Points`,
        `setResults`,
        `side`,
        `losersBracket`,
        `winnerNextMatchId`,
        `loserNextMatchId`,
        `previousLeftId`,
        `previousRightId`,
        `refereeCheckedIn`,
        `teamRefereeId`,
        `locked`,
        `id`
    )
    SELECT
        `matchId`,
        `team1Id`,
        `team2Id`,
        `team1Seed`,
        `team2Seed`,
        `eventId`,
        `refereeId`,
        `fieldId`,
        `start`,
        `end`,
        `division`,
        `team1Points`,
        `team2Points`,
        `setResults`,
        `side`,
        `losersBracket`,
        `winnerNextMatchId`,
        `loserNextMatchId`,
        `previousLeftId`,
        `previousRightId`,
        `refereeCheckedIn`,
        `teamRefereeId`,
        `locked`,
        `id`
    FROM `MatchMVP`
    """.trimIndent(),
    "DROP TABLE `MatchMVP`",
    "ALTER TABLE `MatchMVP_new` RENAME TO `MatchMVP`",
    // Back up Team cross refs in case DROP TABLE cascades when foreign keys are enforced.
    "DROP TABLE IF EXISTS `team_user_cross_ref_backup`",
    "DROP TABLE IF EXISTS `team_pending_player_cross_ref_backup`",
    "DROP TABLE IF EXISTS `event_team_cross_ref_backup`",
    """
    CREATE TABLE `team_user_cross_ref_backup` AS
    SELECT `teamId`, `userId`
    FROM `team_user_cross_ref`
    """.trimIndent(),
    """
    CREATE TABLE `team_pending_player_cross_ref_backup` AS
    SELECT `teamId`, `userId`
    FROM `team_pending_player_cross_ref`
    """.trimIndent(),
    """
    CREATE TABLE `event_team_cross_ref_backup` AS
    SELECT `teamId`, `eventId`
    FROM `event_team_cross_ref`
    """.trimIndent(),
    // Rebuild Team to remove legacy columns while preserving current fields.
    """
    CREATE TABLE IF NOT EXISTS `Team_new` (
        `division` TEXT NOT NULL,
        `name` TEXT,
        `captainId` TEXT NOT NULL,
        `managerId` TEXT,
        `headCoachId` TEXT,
        `coachIds` TEXT NOT NULL,
        `parentTeamId` TEXT,
        `playerIds` TEXT NOT NULL,
        `pending` TEXT NOT NULL,
        `teamSize` INTEGER NOT NULL,
        `profileImageId` TEXT,
        `sport` TEXT,
        `divisionTypeId` TEXT,
        `divisionTypeName` TEXT,
        `skillDivisionTypeId` TEXT,
        `skillDivisionTypeName` TEXT,
        `ageDivisionTypeId` TEXT,
        `ageDivisionTypeName` TEXT,
        `divisionGender` TEXT,
        `id` TEXT NOT NULL,
        PRIMARY KEY(`id`)
    )
    """.trimIndent(),
    """
    INSERT INTO `Team_new` (
        `division`,
        `name`,
        `captainId`,
        `managerId`,
        `headCoachId`,
        `coachIds`,
        `parentTeamId`,
        `playerIds`,
        `pending`,
        `teamSize`,
        `profileImageId`,
        `sport`,
        `divisionTypeId`,
        `divisionTypeName`,
        `skillDivisionTypeId`,
        `skillDivisionTypeName`,
        `ageDivisionTypeId`,
        `ageDivisionTypeName`,
        `divisionGender`,
        `id`
    )
    SELECT
        `division`,
        `name`,
        `captainId`,
        `managerId`,
        `headCoachId`,
        `coachIds`,
        `parentTeamId`,
        `playerIds`,
        `pending`,
        `teamSize`,
        `profileImageId`,
        `sport`,
        `divisionTypeId`,
        `divisionTypeName`,
        `skillDivisionTypeId`,
        `skillDivisionTypeName`,
        `ageDivisionTypeId`,
        `ageDivisionTypeName`,
        `divisionGender`,
        `id`
    FROM `Team`
    """.trimIndent(),
    "DROP TABLE `Team`",
    "ALTER TABLE `Team_new` RENAME TO `Team`",
    """
    INSERT OR IGNORE INTO `team_user_cross_ref` (`teamId`, `userId`)
    SELECT b.`teamId`, b.`userId`
    FROM `team_user_cross_ref_backup` b
    INNER JOIN `Team` t ON t.`id` = b.`teamId`
    INNER JOIN `UserData` u ON u.`id` = b.`userId`
    """.trimIndent(),
    """
    INSERT OR IGNORE INTO `team_pending_player_cross_ref` (`teamId`, `userId`)
    SELECT b.`teamId`, b.`userId`
    FROM `team_pending_player_cross_ref_backup` b
    INNER JOIN `Team` t ON t.`id` = b.`teamId`
    INNER JOIN `UserData` u ON u.`id` = b.`userId`
    """.trimIndent(),
    """
    INSERT OR IGNORE INTO `event_team_cross_ref` (`teamId`, `eventId`)
    SELECT b.`teamId`, b.`eventId`
    FROM `event_team_cross_ref_backup` b
    INNER JOIN `Team` t ON t.`id` = b.`teamId`
    INNER JOIN `Event` e ON e.`id` = b.`eventId`
    """.trimIndent(),
    "DROP TABLE IF EXISTS `team_user_cross_ref_backup`",
    "DROP TABLE IF EXISTS `team_pending_player_cross_ref_backup`",
    "DROP TABLE IF EXISTS `event_team_cross_ref_backup`",
)
