package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.SQLiteConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import io.github.aakira.napier.Napier
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.Dispatchers
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSFileManager
import platform.Foundation.NSUserDomainMask


fun getDatabase(): RoomDatabase.Builder<MVPDatabaseService> {
    return try {
        Room.databaseBuilder<MVPDatabaseService>(
            name = documentDirectory() + "/tournament.db",
        )
            .setDriver(BundledSQLiteDriver())
            .setQueryCoroutineContext(Dispatchers.Default)
            .addMigrations(
                MIGRATION_1_2_NO_OP,
                MIGRATION_2_3_MATCH_START_NULLABLE,
                MIGRATION_3_4_USER_PRIVACY_FIELDS,
            )
            .fallbackToDestructiveMigrationOnDowngrade(true)

            .also { Napier.d(tag = "Database") { "Database builder created successfully" } }
    } catch (e: Exception) {
        Napier.e(tag = "Database", throwable = e) { "Failed to create database builder" }
        throw e
    }
}

private val MIGRATION_1_2_NO_OP = object : Migration(1, 2) {
    override fun migrate(connection: SQLiteConnection) {
        // Schema did not change between versions 1 and 2; this satisfies Room's required path.
    }
}

private val MIGRATION_2_3_MATCH_START_NULLABLE = object : Migration(2, 3) {
    override fun migrate(connection: SQLiteConnection) {
        val migrationSql = listOf(
            """
            CREATE TABLE IF NOT EXISTS `MatchMVP_new` (
                `matchId` INTEGER NOT NULL,
                `team1Id` TEXT,
                `team2Id` TEXT,
                `team1Seed` INTEGER,
                `team2Seed` INTEGER,
                `eventId` TEXT NOT NULL,
                `officialId` TEXT,
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
                `officialCheckedIn` INTEGER,
                `teamOfficialId` TEXT,
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
                `officialId`,
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
                `officialCheckedIn`,
                `teamOfficialId`,
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
                `officialId`,
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
                `officialCheckedIn`,
                `teamOfficialId`,
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

        migrationSql.forEach { sql ->
            connection.prepare(sql).use { statement ->
                statement.step()
            }
        }
    }
}

private val MIGRATION_3_4_USER_PRIVACY_FIELDS = object : Migration(3, 4) {
    override fun migrate(connection: SQLiteConnection) {
        val migrationSql = listOf(
            "ALTER TABLE `UserData` ADD COLUMN `privacyDisplayName` TEXT",
            "ALTER TABLE `UserData` ADD COLUMN `isMinor` INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE `UserData` ADD COLUMN `isIdentityHidden` INTEGER NOT NULL DEFAULT 0",
        )

        migrationSql.forEach { sql ->
            connection.prepare(sql).use { statement ->
                statement.step()
            }
        }
    }
}

@OptIn(ExperimentalForeignApi::class)
private fun documentDirectory(): String {
    Napier.d(tag = "Database") { "Fetching document directory" }

    return try {
        val documentDirectory = NSFileManager.defaultManager.URLForDirectory(
            directory = NSDocumentDirectory,
            inDomain = NSUserDomainMask,
            appropriateForURL = null,
            create = false,
            error = null,
        )
        requireNotNull(documentDirectory?.path).also {
            Napier.d(tag = "Database") { "Document directory path: $it" }
        }
    } catch (e: Exception) {
        Napier.e(tag = "Database", throwable = e) { "Failed to get document directory" }
        throw e
    }
}
