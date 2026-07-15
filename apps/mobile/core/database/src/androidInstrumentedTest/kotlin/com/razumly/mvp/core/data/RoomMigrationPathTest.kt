package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_REJECTED
import com.razumly.mvp.core.db.MVP_DATABASE_VERSION
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.Rule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoomMigrationPathTest {
    @get:Rule
    val migrationHelper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        MVPDatabaseService::class.java,
    )

    @Test
    fun allSupportedHistoricalSchemas_migrateThroughChronologicalGraph_toCurrentSchema() {
        supportedSourceVersions.forEach { sourceVersion ->
            val databaseName = "room-history-$sourceVersion"
            migrationHelper.createDatabase(databaseName, sourceVersion).close()

            migrationHelper.runMigrationsAndValidate(
                databaseName,
                MVP_DATABASE_VERSION,
                sourceVersion !in legacyFixtureSourceVersions,
                *MVP_DATABASE_MIGRATIONS,
            ).close()
        }
    }

    @Test
    fun v24OutboxRow_survivesTheRemainingReleasedMigrationPath() {
        val databaseName = "room-outbox-v24"
        migrationHelper.createDatabase(databaseName, 24).use { database ->
            database.execSQL(
                """
                INSERT INTO `MatchOperationOutboxEntry` (
                    `id`, `eventId`, `matchId`, `operationKind`, `payloadJson`, `status`,
                    `sourceDevice`, `clientDeviceId`, `clientSequence`, `clientCreatedAt`,
                    `attemptCount`, `lastError`, `lastAttemptAt`, `ackedAt`
                ) VALUES (
                    'outbox-1', 'event-1', 'match-1', 'SCORE_UPDATE', '{"score":1}', 'PENDING',
                    'ANDROID', 'device-1', 4, '2026-01-01T00:00:00Z', 2, 'retry later',
                    '2026-01-01T00:02:00Z', NULL
                )
                """.trimIndent(),
            )
        }

        migrationHelper.runMigrationsAndValidate(
            databaseName,
            MVP_DATABASE_VERSION,
            true,
            *MVP_DATABASE_MIGRATIONS,
        ).use { database ->
            database.query(
                "SELECT `payloadJson`, `attemptCount`, `lastError` FROM `MatchOperationOutboxEntry` WHERE `id` = 'outbox-1'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("{\"score\":1}", cursor.getString(0))
                assertEquals(2, cursor.getInt(1))
                assertEquals("retry later", cursor.getString(2))
            }
        }
    }

    @Test
    fun v34PendingRentalOrder_isQuarantinedWithoutLosingCheckoutContext() {
        val databaseName = "room-pending-rental-v34"
        migrationHelper.createDatabase(databaseName, 34).use { database ->
            database.execSQL(
                """
                INSERT INTO `PendingRentalOrder` (
                    `id`, `publicSlug`, `eventId`, `selectionsJson`, `paymentIntentId`,
                    `renterOrganizationId`, `sportId`, `status`, `attemptCount`, `lastError`,
                    `createdAt`, `lastAttemptAt`
                ) VALUES (
                    'pending-1', 'river-city', 'event-1', '[{"fieldId":"court-1"}]', 'pi_123',
                    'org-1', 'volleyball', 'PENDING', 3, 'network interrupted',
                    '2026-01-01T00:00:00Z', '2026-01-01T00:02:00Z'
                )
                """.trimIndent(),
            )
        }

        migrationHelper.runMigrationsAndValidate(
            databaseName,
            MVP_DATABASE_VERSION,
            true,
            *MVP_DATABASE_MIGRATIONS,
        ).use { database ->
            database.query(
                """
                SELECT `payerUserId`, `status`, `selectionsJson`, `paymentIntentId`, `attemptCount`,
                       `createdAt`, `lastAttemptAt`, `lastError`
                FROM `PendingRentalOrder`
                WHERE `id` = 'pending-1'
                """.trimIndent(),
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID, cursor.getString(0))
                assertEquals(PENDING_RENTAL_ORDER_STATUS_REJECTED, cursor.getString(1))
                assertEquals("[{\"fieldId\":\"court-1\"}]", cursor.getString(2))
                assertEquals("pi_123", cursor.getString(3))
                assertEquals(3, cursor.getInt(4))
                assertEquals("2026-01-01T00:00:00Z", cursor.getString(5))
                assertEquals("2026-01-01T00:02:00Z", cursor.getString(6))
                assertTrue(cursor.getString(7).contains("payer could not be verified"))
            }
        }
    }

    @Test
    fun v90FieldMigration_addsWritableFacilityId() {
        val databaseName = "room-field-facility-v90"
        migrationHelper.createDatabase(databaseName, 90).use { database ->
            database.execSQL(
                """
                INSERT INTO `Field` (
                    `fieldNumber`, `divisions`, `lat`, `long`, `heading`, `inUse`, `name`,
                    `rentalSlotIds`, `location`, `organizationId`, `id`
                ) VALUES (
                    2, '[]', NULL, NULL, NULL, 0, 'Court 2', '[]', NULL, 'org-1', 'field-1'
                )
                """.trimIndent(),
            )
        }

        migrationHelper.runMigrationsAndValidate(
            databaseName,
            MVP_DATABASE_VERSION,
            true,
            *MVP_DATABASE_MIGRATIONS,
        ).use { database ->
            database.execSQL("UPDATE `Field` SET `facilityId` = 'facility-1' WHERE `id` = 'field-1'")
            database.query(
                "SELECT `facilityId` FROM `Field` WHERE `id` = 'field-1'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("facility-1", cursor.getString(0))
            }
        }
    }

    @Test
    fun fieldDao_roundTripsCanonicalFacilityId() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            database.getFieldDao.upsertField(
                Field(
                    id = "field-1",
                    fieldNumber = 2,
                    name = "Court 2",
                    organizationId = "org-1",
                    facilityId = "facility-1",
                ),
            )

            val cached = database.getFieldDao.getFieldsByIds(listOf("field-1")).single()
            assertEquals("facility-1", cached.facilityId)
        } finally {
            database.close()
        }
    }

    @Test
    fun v50AlternateSchemaWithoutAccountId_opensWithoutDestructiveRecovery() {
        val databaseName = "room-history-v50-without-account-id"
        migrationHelper.createDatabase(databaseName, 50).use { database ->
            // A later v50 class reused the same on-device user_version without
            // UserData.accountId. Reconstruct that published layout so the bridge
            // cannot accidentally select a column that is absent at runtime.
            database.execSQL("PRAGMA foreign_keys = OFF")
            database.execSQL("DROP TABLE `UserData`")
            database.execSQL(
                """
                CREATE TABLE `UserData` (
                    `firstName` TEXT NOT NULL,
                    `lastName` TEXT NOT NULL,
                    `tournamentIds` TEXT NOT NULL,
                    `eventIds` TEXT NOT NULL,
                    `teamIds` TEXT NOT NULL,
                    `friendIds` TEXT NOT NULL,
                    `userName` TEXT NOT NULL,
                    `teamInvites` TEXT NOT NULL,
                    `eventInvites` TEXT NOT NULL,
                    `tournamentInvites` TEXT NOT NULL,
                    `id` TEXT NOT NULL,
                    PRIMARY KEY(`id`)
                )
                """.trimIndent(),
            )
            database.execSQL(
                """
                INSERT INTO `UserData` (
                    `firstName`, `lastName`, `tournamentIds`, `eventIds`, `teamIds`,
                    `friendIds`, `userName`, `teamInvites`, `eventInvites`,
                    `tournamentInvites`, `id`
                ) VALUES (
                    'Legacy', 'User', '[]', '[]', '[]', '[]', 'legacy-user',
                    '[]', '[]', '[]', 'user-no-account'
                )
                """.trimIndent(),
            )
            database.execSQL("PRAGMA user_version = 50")
        }

        migrationHelper.runMigrationsAndValidate(
            databaseName,
            MVP_DATABASE_VERSION,
            false,
            *MVP_DATABASE_MIGRATIONS,
        ).use { database ->
            database.query(
                "SELECT `hasStripeAccount` FROM `UserData` WHERE `id` = 'user-no-account'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertTrue(cursor.isNull(0))
            }
            database.query(
                "SELECT `id` FROM `legacy_v50_UserData` WHERE `id` = 'user-no-account'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("user-no-account", cursor.getString(0))
            }
        }
    }

    @Test
    fun v88LegacySchema_preservesMatchSeedsAndArchiveRows() {
        val databaseName = "room-history-v88-reconstructed"
        migrationHelper.createDatabase(databaseName, 87).use { database ->
            insertRepresentativeV87Rows(database)
            database.execSQL("ALTER TABLE `MatchMVP` ADD COLUMN `team1Seed` INTEGER")
            database.execSQL("ALTER TABLE `MatchMVP` ADD COLUMN `team2Seed` INTEGER")
            database.execSQL("UPDATE `MatchMVP` SET `team1Seed` = 3, `team2Seed` = 7 WHERE `id` = 'match-legacy'")
            database.execSQL("PRAGMA user_version = 88")
        }

        migrationHelper.runMigrationsAndValidate(
            databaseName,
            MVP_DATABASE_VERSION,
            false,
            *MVP_DATABASE_MIGRATIONS,
        ).use { database ->
            database.query(
                "SELECT `team1Seed`, `team2Seed` FROM `MatchMVP` WHERE `id` = 'match-legacy'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(3, cursor.getInt(0))
                assertEquals(7, cursor.getInt(1))
            }
            database.query(
                "SELECT `team1Seed`, `team2Seed` FROM `legacy_v88_MatchMVP` WHERE `id` = 'match-legacy'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(3, cursor.getInt(0))
                assertEquals(7, cursor.getInt(1))
            }
        }
    }

    @Test
    fun v89LegacySchema_mapsTeamRefsMaySwapAndRetainsTheSourceArchive() {
        val databaseName = "room-history-v89-reconstructed"
        migrationHelper.createDatabase(databaseName, 87).use { database ->
            insertRepresentativeV87Rows(database)
            database.execSQL("ALTER TABLE `MatchMVP` ADD COLUMN `team1Seed` INTEGER")
            database.execSQL("ALTER TABLE `MatchMVP` ADD COLUMN `team2Seed` INTEGER")
            database.execSQL("ALTER TABLE `Event` ADD COLUMN `teamRefsMaySwap` INTEGER")
            database.execSQL("UPDATE `Event` SET `teamRefsMaySwap` = 1 WHERE `id` = 'event-legacy'")
            database.execSQL("PRAGMA user_version = 89")
        }

        migrationHelper.runMigrationsAndValidate(
            databaseName,
            MVP_DATABASE_VERSION,
            false,
            *MVP_DATABASE_MIGRATIONS,
        ).use { database ->
            database.query(
                "SELECT `teamOfficialsMaySwap` FROM `Event` WHERE `id` = 'event-legacy'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(1, cursor.getInt(0))
            }
            database.query(
                "SELECT `teamRefsMaySwap` FROM `legacy_v89_Event` WHERE `id` = 'event-legacy'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(1, cursor.getInt(0))
            }
        }
    }

    private fun insertRepresentativeV87Rows(database: androidx.sqlite.db.SupportSQLiteDatabase) {
        database.execSQL(
            """
            INSERT INTO `Event` (
                `doubleElimination`, `winnerSetCount`, `loserSetCount`,
                `winnerBracketPointsToVictory`, `loserBracketPointsToVictory`, `prize`,
                `id`, `name`, `description`, `divisions`, `divisionDetails`, `location`,
                `start`, `end`, `priceCents`, `imageId`, `coordinates`, `hostId`,
                `assistantHostIds`, `noFixedEndDateTime`, `teamSignup`, `singleDivision`,
                `freeAgentIds`, `waitListIds`, `userIds`, `teamIds`,
                `cancellationRefundHours`, `registrationCutoffHours`, `seedColor`,
                `timeSlotIds`, `fieldIds`, `autoCancellation`, `maxParticipants`,
                `teamSizeLimit`, `registrationByDivisionType`, `eventType`,
                `includePlayoffs`, `usesSets`, `state`, `pointsToVictory`, `refereeIds`,
                `installmentDueDates`, `installmentAmounts`, `requiredTemplateIds`, `lastUpdated`
            ) VALUES (
                0, 1, 0,
                '[]', '[]', '',
                'event-legacy', 'Legacy event', '', '[]', '[]', '',
                0, 0, 0, '', '[]', 'host-legacy',
                '[]', 0, 0, 0,
                '[]', '[]', '[]', '[]',
                0, 0, 0,
                '[]', '[]', 0, 0,
                0, 0, 'EVENT',
                0, 0, 'PUBLISHED', '[]', '[]',
                '[]', '[]', '[]', 0
            )
            """.trimIndent(),
        )
        database.execSQL(
            """
            INSERT INTO `MatchMVP` (
                `matchId`, `eventId`, `start`, `team1Points`, `team2Points`,
                `setResults`, `losersBracket`, `locked`, `id`
            ) VALUES (
                1, 'event-legacy', 0, '[]', '[]', '[]', 0, 0, 'match-legacy'
            )
            """.trimIndent(),
        )
    }

    private companion object {
        val legacyFixtureSourceVersions = setOf(
            50, 51, 52, 53, 54, 55,
            59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
            70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
            80, 81, 82, 83, 84, 85, 86, 87,
        )
        val supportedSourceVersions =
            (3..25).toList() +
                (28..32).toList() +
                listOf(34, 35, 90) +
                legacyFixtureSourceVersions.sorted()
    }
}
