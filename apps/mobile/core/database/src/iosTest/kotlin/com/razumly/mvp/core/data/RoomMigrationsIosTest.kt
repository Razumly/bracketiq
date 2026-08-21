package com.razumly.mvp.core.data

import androidx.sqlite.SQLiteConnection
import androidx.sqlite.SQLiteStatement
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_REJECTED
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.use

class RoomMigrationsIosTest {
    @Test
    fun givenV32Rows_whenMigratedToV90_thenPreservesOutboxAndQuarantinesUnknownPayer() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            connection.execute(
                """
                CREATE TABLE `RefundRequest` (
                    `id` TEXT NOT NULL,
                    `eventId` TEXT NOT NULL,
                    `userId` TEXT NOT NULL,
                    `hostId` TEXT,
                    `reason` TEXT NOT NULL,
                    `organizationId` TEXT,
                    `status` TEXT,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            connection.execute(
                """
                INSERT INTO `RefundRequest` (`id`, `eventId`, `userId`, `hostId`, `reason`, `organizationId`, `status`)
                VALUES ('refund-1', 'event-1', 'user-1', 'host-1', 'weather', 'org-1', 'PENDING')
                """.trimIndent(),
            )
            connection.execute(
                """
                CREATE TABLE `MatchOperationOutboxEntry` (
                    `id` TEXT NOT NULL,
                    `payloadJson` TEXT NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            connection.execute(
                "INSERT INTO `MatchOperationOutboxEntry` (`id`, `payloadJson`) VALUES ('outbox-1', '{\"score\":1}')",
            )

            val migrations = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.take(4)
            assertEquals(listOf(32, 33, 34, 35), migrations.map { it.startVersion })
            assertEquals(listOf(33, 34, 35, 90), migrations.map { it.endVersion })

            migrations[0].migrate(connection)
            migrations[1].migrate(connection)
            connection.execute(
                """
                INSERT INTO `PendingRentalOrder` (
                    `id`, `publicSlug`, `eventId`, `selectionsJson`, `paymentIntentId`,
                    `renterOrganizationId`, `sportId`, `status`, `attemptCount`, `lastError`,
                    `createdAt`, `lastAttemptAt`
                ) VALUES (
                    'pending-1', 'river-city', 'event-1', '[{"fieldId":"court-1"}]', 'pi_123',
                    'org-1', 'volleyball', 'AWAITING_PAYMENT', 3, 'network interrupted',
                    '2026-01-01T00:00:00Z', '2026-01-01T00:02:00Z'
                )
                """.trimIndent(),
            )
            migrations[2].migrate(connection)
            migrations[3].migrate(connection)

            connection.assertSingleRow(
                "SELECT `reason`, `billIds`, `paymentIds`, `currency`, `scopeVersion` FROM `RefundRequest` WHERE `id` = 'refund-1'",
            ) { statement ->
                assertEquals("weather", statement.getText(0))
                assertEquals("[]", statement.getText(1))
                assertEquals("[]", statement.getText(2))
                assertEquals("usd", statement.getText(3))
                assertEquals(1, statement.getInt(4))
            }
            connection.assertSingleRow(
                "SELECT `payloadJson` FROM `MatchOperationOutboxEntry` WHERE `id` = 'outbox-1'",
            ) { statement ->
                assertEquals("{\"score\":1}", statement.getText(0))
            }
            connection.assertSingleRow(
                "SELECT `payerUserId`, `status`, `selectionsJson`, `lastError` FROM `PendingRentalOrder` WHERE `id` = 'pending-1'",
            ) { statement ->
                assertEquals(PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID, statement.getText(0))
                assertEquals(PENDING_RENTAL_ORDER_STATUS_REJECTED, statement.getText(1))
                assertEquals("[{\"fieldId\":\"court-1\"}]", statement.getText(2))
                assertTrue(statement.getText(3).contains("payer could not be verified"))
            }
        }
    }

    @Test
    fun v90FieldMigration_addsWritableFacilityId() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            connection.execute(
                """
                CREATE TABLE `Field` (
                    `fieldNumber` INTEGER NOT NULL,
                    `divisions` TEXT NOT NULL,
                    `lat` REAL,
                    `long` REAL,
                    `heading` REAL,
                    `inUse` INTEGER,
                    `name` TEXT,
                    `rentalSlotIds` TEXT NOT NULL,
                    `location` TEXT,
                    `organizationId` TEXT,
                    `id` TEXT NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            connection.execute(
                """
                INSERT INTO `Field` (
                    `fieldNumber`, `divisions`, `rentalSlotIds`, `organizationId`, `id`
                ) VALUES (2, '[]', '[]', 'org-1', 'field-1')
                """.trimIndent(),
            )

            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first { it.startVersion == 90 }
            assertEquals(90, migration.startVersion)
            assertEquals(91, migration.endVersion)
            migration.migrate(connection)

            connection.execute("UPDATE `Field` SET `facilityId` = 'facility-1' WHERE `id` = 'field-1'")
            connection.assertSingleRow(
                "SELECT `facilityId` FROM `Field` WHERE `id` = 'field-1'",
            ) { statement ->
                assertEquals("facility-1", statement.getText(0))
            }
        }
    }

    @Test
    fun v91CatalogMigration_createsViewerScopedExactQueryCacheTables() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first { it.startVersion == 91 }
            assertEquals(91, migration.startVersion)
            assertEquals(92, migration.endVersion)
            migration.migrate(connection)

            connection.execute(
                "INSERT INTO `catalog_cache_viewer` (`id`, `viewerKey`) VALUES ('active', 'viewer-a')",
            )
            connection.execute(
                "INSERT INTO `time_slot_cache` (`viewerKey`, `projectionKey`, `id`, `payloadJson`) VALUES ('viewer-a', 'authenticated', 'slot-1', '{}')",
            )
            connection.execute(
                "INSERT INTO `catalog_query_cache` (`cacheKey`, `viewerKey`, `resourceType`, `projectionKey`, `orderedIdsJson`, `payloadJson`, `paginationJson`, `isComplete`) VALUES ('query-a', 'viewer-a', 'time-slots', 'authenticated', '[\"slot-1\"]', '[]', '{\"hasMore\":false}', 1)",
            )

            connection.assertSingleRow(
                "SELECT `viewerKey`, `projectionKey`, `isComplete` FROM `catalog_query_cache` WHERE `cacheKey` = 'query-a'",
            ) { statement ->
                assertEquals("viewer-a", statement.getText(0))
                assertEquals("authenticated", statement.getText(1))
                assertEquals(1L, statement.getLong(2))
            }
        }
    }

    @Test
    fun v92MembershipMigration_backfillsExactIdsAndAllowsMissingUserProfiles() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute(
                "CREATE TABLE `Team` (`id` TEXT NOT NULL, `playerIds` TEXT NOT NULL, `pending` TEXT NOT NULL, PRIMARY KEY(`id`))",
            )
            connection.execute(
                "CREATE TABLE `UserData` (`id` TEXT NOT NULL, `teamIds` TEXT NOT NULL, PRIMARY KEY(`id`))",
            )
            connection.execute(
                "CREATE TABLE `ChatGroup` (`id` TEXT NOT NULL, `userIds` TEXT NOT NULL, PRIMARY KEY(`id`))",
            )
            connection.execute(
                "CREATE TABLE `team_user_cross_ref` (`teamId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `userId`), FOREIGN KEY(`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE, FOREIGN KEY(`userId`) REFERENCES `UserData`(`id`) ON DELETE CASCADE)",
            )
            connection.execute(
                "CREATE TABLE `team_pending_player_cross_ref` (`teamId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`teamId`, `userId`), FOREIGN KEY(`teamId`) REFERENCES `Team`(`id`) ON DELETE CASCADE, FOREIGN KEY(`userId`) REFERENCES `UserData`(`id`) ON DELETE CASCADE)",
            )
            connection.execute(
                "CREATE TABLE `chat_user_cross_ref` (`chatId` TEXT NOT NULL, `userId` TEXT NOT NULL, PRIMARY KEY(`chatId`, `userId`), FOREIGN KEY(`chatId`) REFERENCES `ChatGroup`(`id`) ON DELETE CASCADE, FOREIGN KEY(`userId`) REFERENCES `UserData`(`id`) ON DELETE CASCADE)",
            )
            connection.execute("INSERT INTO `Team` VALUES ('team-array', '[\"user_10\",\"missing_user\"]', '[\"missing_pending\"]')")
            connection.execute("INSERT INTO `Team` VALUES ('team-from-user', '[]', '[]')")
            connection.execute("INSERT INTO `UserData` VALUES ('user_10', '[\"team-from-user\"]')")
            connection.execute("INSERT INTO `UserData` VALUES ('existing_user', '[]')")
            connection.execute("INSERT INTO `ChatGroup` VALUES ('chat-array', '[\"user_10\",\"missing_chat_user\"]')")
            connection.execute("INSERT INTO `team_user_cross_ref` VALUES ('team-array', 'existing_user')")
            connection.execute("INSERT INTO `chat_user_cross_ref` VALUES ('chat-array', 'existing_user')")

            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first { it.startVersion == 92 }
            assertEquals(92, migration.startVersion)
            assertEquals(93, migration.endVersion)
            migration.migrate(connection)

            connection.assertSingleRow(
                "SELECT group_concat(`pair`, ',') FROM (SELECT `teamId` || ':' || `userId` AS `pair` FROM `team_user_cross_ref` ORDER BY `teamId`, `userId`)",
            ) { statement ->
                assertEquals(
                    "team-array:existing_user,team-array:missing_user,team-array:user_10,team-from-user:user_10",
                    statement.getText(0),
                )
            }
            connection.assertSingleRow(
                "SELECT `userId` FROM `team_pending_player_cross_ref` WHERE `teamId` = 'team-array'",
            ) { statement -> assertEquals("missing_pending", statement.getText(0)) }
            connection.assertSingleRow(
                "SELECT group_concat(`userId`, ',') FROM (SELECT `userId` FROM `chat_user_cross_ref` WHERE `chatId` = 'chat-array' ORDER BY `userId`)",
            ) { statement ->
                assertEquals("existing_user,missing_chat_user,user_10", statement.getText(0))
            }

            connection.assertColumnAbsent("Team", "playerIds")
            connection.assertColumnAbsent("Team", "pending")
            connection.assertColumnAbsent("ChatGroup", "userIds")
            connection.assertColumnAbsent("UserData", "teamIds")
            connection.assertForeignKeyParents("team_user_cross_ref", listOf("Team"))
            connection.assertForeignKeyParents("team_pending_player_cross_ref", listOf("Team"))
            connection.assertForeignKeyParents("chat_user_cross_ref", listOf("ChatGroup"))

            connection.execute(
                "INSERT INTO `team_user_cross_ref` (`teamId`, `userId`) VALUES ('team-array', 'arrived-before-profile')",
            )
            connection.execute("DELETE FROM `Team` WHERE `id` = 'team-array'")
            connection.assertSingleRow(
                "SELECT COUNT(*) FROM `team_user_cross_ref` WHERE `teamId` = 'team-array'",
            ) { statement -> assertEquals(0L, statement.getLong(0)) }
        }
    }

    @Test
    fun v96FieldSportIdsMigration_preservesRowsWithDeterministicEmptyScope() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            connection.execute("CREATE TABLE `Field` (`id` TEXT NOT NULL, PRIMARY KEY(`id`))")
            connection.execute("INSERT INTO `Field` (`id`) VALUES ('field-existing')")

            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first { it.startVersion == 96 }
            assertEquals(97, migration.endVersion)
            migration.migrate(connection)

            connection.assertSingleRow(
                "SELECT `sportIds` FROM `Field` WHERE `id` = 'field-existing'",
            ) { statement -> assertEquals("[]", statement.getText(0)) }
        }
    }
    @Test
    fun givenLegacyOfficialSchedulingModes_whenMigratedFromV97ToV98_thenBackfillsCanonicalStaffingPriority() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            connection.execute(
                """
                CREATE TABLE `Event` (
                    `id` TEXT NOT NULL,
                    `officialSchedulingMode` TEXT NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            connection.execute(
                """
                INSERT INTO `Event` (`id`, `officialSchedulingMode`) VALUES
                    ('event-off', ' OFF '),
                    ('event-schedule', 'SCHEDULE'),
                    ('event-staffing', 'STAFFING'),
                    ('event-team', 'TEAM_STAFFING'),
                    ('event-unknown', 'legacy-value')
                """.trimIndent(),
            )

            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first {
                it.startVersion == 97
            }
            assertEquals(98, migration.endVersion)
            migration.migrate(connection)

            connection.assertSingleRow(
                "SELECT `staffingPriority` FROM `Event` WHERE `id` = 'event-off'",
            ) { statement ->
                assertEquals("FULL_COVERAGE_WITH_CONFLICTS_ALLOWED", statement.getText(0))
            }
            connection.assertSingleRow(
                "SELECT `staffingPriority` FROM `Event` WHERE `id` = 'event-schedule'",
            ) { statement ->
                assertEquals("BEST_AVAILABLE_COVERAGE", statement.getText(0))
            }
            connection.assertSingleRow(
                "SELECT `staffingPriority` FROM `Event` WHERE `id` = 'event-staffing'",
            ) { statement ->
                assertEquals("OFFICIAL_COVERAGE_REQUIRED", statement.getText(0))
            }
            connection.assertSingleRow(
                "SELECT `staffingPriority` FROM `Event` WHERE `id` = 'event-team'",
            ) { statement ->
                assertEquals("TEAM_COVERAGE_REQUIRED", statement.getText(0))
            }
            connection.assertSingleRow(
                "SELECT `staffingPriority` FROM `Event` WHERE `id` = 'event-unknown'",
            ) { statement ->
                assertEquals("BEST_AVAILABLE_COVERAGE", statement.getText(0))
            }
        }
    }

    @Test
    fun givenV98MatchRows_whenMigratedToV99_thenPreservesPlacementAndAddsPhaseOwnership() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            connection.execute(
                """
                CREATE TABLE `MatchMVP` (
                    `id` TEXT NOT NULL,
                    `fieldId` TEXT,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            connection.execute(
                """
                INSERT INTO `MatchMVP` (`id`, `fieldId`) VALUES
                    ('placed', 'field-1'),
                    ('unplaced', NULL)
                """.trimIndent(),
            )

            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first {
                it.startVersion == 98
            }
            assertEquals(99, migration.endVersion)
            migration.migrate(connection)

            connection.assertSingleRow(
                "SELECT `placementState` FROM `MatchMVP` WHERE `id` = 'placed'",
            ) { statement -> assertEquals("PLACED", statement.getText(0)) }
            connection.assertSingleRow(
                "SELECT `placementState` FROM `MatchMVP` WHERE `id` = 'unplaced'",
            ) { statement -> assertEquals("UNPLACED", statement.getText(0)) }
            connection.execute(
                "UPDATE `MatchMVP` SET `phase` = 'POOL', `sourceDivisionId` = 'entry-open' " +
                    "WHERE `id` = 'unplaced'",
            )
            connection.assertSingleRow(
                "SELECT `phase`, `sourceDivisionId` FROM `MatchMVP` WHERE `id` = 'unplaced'",
            ) { statement ->
                assertEquals("POOL", statement.getText(0))
                assertEquals("entry-open", statement.getText(1))
            }
        }
    }
    @Test
    fun givenV99MatchRows_whenMigratedToV100_thenBackfillsPhaseOwnerWithoutChangingEntrySelection() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            connection.execute(
                """
                CREATE TABLE `MatchMVP` (
                    `id` TEXT NOT NULL,
                    `division` TEXT,
                    `sourceDivisionId` TEXT,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            connection.execute(
                """
                INSERT INTO `MatchMVP` (`id`, `division`, `sourceDivisionId`) VALUES
                    ('phase-match', 'phase-pool', 'entry-open'),
                    ('entry-match', 'entry-open', NULL)
                """.trimIndent(),
            )

            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first {
                it.startVersion == 99
            }
            assertEquals(100, migration.endVersion)
            migration.migrate(connection)

            connection.assertSingleRow(
                "SELECT `phaseDivisionId` FROM `MatchMVP` WHERE `id` = 'phase-match'",
            ) { statement -> assertEquals("phase-pool", statement.getText(0)) }
            connection.assertSingleRow(
                "SELECT `phaseDivisionId` FROM `MatchMVP` WHERE `id` = 'entry-match'",
            ) { statement -> assertTrue(statement.isNull(0)) }
        }
    }
    @Test
    fun givenV100DatabaseWithoutProfileDocuments_whenMigratedToV101_thenCreatesDocumentCacheWithVersionColumns() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first {
                it.startVersion == 100
            }
            assertEquals(101, migration.endVersion)
            migration.migrate(connection)
            connection.assertSingleRow(
                "SELECT `name` FROM `sqlite_master` WHERE `type` = 'table' AND `name` = 'profile_document_cache'",
            ) { statement -> assertEquals("profile_document_cache", statement.getText(0)) }

            connection.execute(
                """
                INSERT INTO `profile_document_cache` (
                    `viewerKey`, `id`, `sortOrder`, `status`, `organizationName`,
                    `templateId`, `documentRequirementTitle`, `versionSequence`,
                    `title`, `type`, `requiredSignerType`, `requiredSignerLabel`,
                    `signerContext`, `signerContextLabel`, `requiresChildEmail`,
                    `signedDocumentRecordId`
                ) VALUES (
                    'viewer-1', 'imported-1', 0, 'SIGNED', 'City League',
                    'template-1', 'Imported waiver requirement', 2,
                    'Imported waiver', 'PDF', 'PARTICIPANT', 'Participant',
                    'participant', 'Participant', 0, 'imported-1'
                )
                """.trimIndent(),
            )
            connection.assertSingleRow(
                """
                SELECT `id`, `documentRequirementTitle`, `versionSequence`
                FROM `profile_document_cache`
                WHERE `viewerKey` = 'viewer-1' AND `id` = 'imported-1'
                """.trimIndent(),
            ) { statement ->
                assertEquals("imported-1", statement.getText(0))
                assertEquals("Imported waiver requirement", statement.getText(1))
                assertEquals(2, statement.getInt(2))
            }
        }
    }
    @Test
    fun given_v101_database_when_event_time_slot_migration_runs_then_creates_event_owned_ordered_slot_cache() {
        BundledSQLiteDriver().open(":memory:").use { connection ->
            val migration = IOS_MVP_DATABASE_MIGRATIONS_V32_TO_V102.first {
                it.startVersion == 101
            }

            assertEquals(102, migration.endVersion)
            migration.migrate(connection)

            val columns = buildMap {
                connection.prepare("PRAGMA table_info(`event_time_slot_cache`)").use { statement ->
                    while (statement.step()) {
                        put(statement.getText(1), statement.getText(2))
                    }
                }
            }
            assertEquals("INTEGER", columns["startDate"])
            assertEquals("INTEGER", columns["endDate"])
            assertEquals("TEXT", columns["requiredTemplateIds"])
            assertEquals("TEXT", columns["hostRequiredTemplateIds"])

            connection.execute(
                """
                INSERT INTO `event_time_slot_cache` (
                    `eventId`, `slotId`, `position`, `startDate`, `timeZone`,
                    `repeating`, `requiredTemplateIds`, `hostRequiredTemplateIds`
                ) VALUES ('event-1', 'slot-1', 0, 1781395200000, 'UTC', 0, '[]', '[]')
                """.trimIndent(),
            )
            connection.assertSingleRow(
                "SELECT `eventId`, `slotId`, `position` FROM `event_time_slot_cache`",
            ) { statement ->
                assertEquals("event-1", statement.getText(0))
                assertEquals("slot-1", statement.getText(1))
                assertEquals(0, statement.getInt(2))
            }
        }
    }
}

private fun SQLiteConnection.execute(sql: String) {
    prepare(sql).use { statement ->
        statement.step()
    }
}

private fun SQLiteConnection.assertSingleRow(
    sql: String,
    assertion: (SQLiteStatement) -> Unit,
) {
    prepare(sql).use { statement ->
        assertTrue(statement.step(), "Expected one row for query: $sql")
        assertion(statement)
        assertTrue(!statement.step(), "Expected exactly one row for query: $sql")
    }
}

private fun SQLiteConnection.assertColumnAbsent(
    tableName: String,
    columnName: String,
) {
    prepare("PRAGMA table_info(`$tableName`)").use { statement ->
        while (statement.step()) {
            check(statement.getText(1) != columnName) {
                "Expected $tableName.$columnName to be removed."
            }
        }
    }
}

private fun SQLiteConnection.assertForeignKeyParents(
    tableName: String,
    expectedParents: List<String>,
) {
    val parents = buildList {
        prepare("PRAGMA foreign_key_list(`$tableName`)").use { statement ->
            while (statement.step()) add(statement.getText(2))
        }
    }
    assertEquals(expectedParents, parents)
}
