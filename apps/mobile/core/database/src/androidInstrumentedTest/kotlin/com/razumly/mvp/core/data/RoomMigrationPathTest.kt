package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_ACKED
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_LEGACY_UNKNOWN_PAYER_ID
import com.razumly.mvp.core.data.dataTypes.PENDING_RENTAL_ORDER_STATUS_REJECTED
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.normalizedStatus
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.db.MVP_DATABASE_VERSION
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
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
    fun v92MembershipMigration_backfillsExactIdsAndRemovesDuplicateColumns() {
        val databaseName = "room-canonical-membership-v92"
        migrationHelper.createDatabase(databaseName, 92).use { database ->
            database.execSQL(
                """
                INSERT INTO `Team` (
                    `division`, `name`, `captainId`, `coachIds`, `playerIds`,
                    `playerRegistrationIds`, `pending`, `staffAssignmentIds`, `teamSize`,
                    `joinPolicy`, `openRegistration`, `registrationPriceCents`,
                    `requiredTemplateIds`, `playerRegistrations`, `staffAssignments`, `id`
                ) VALUES
                    ('OPEN', 'Array team', 'user_10', '[]', '["user_10","missing_user"]', '[]', '["missing_pending"]', '[]', 2, 'CLOSED', 0, 0, '[]', '[]', '[]', 'team-array'),
                    ('OPEN', 'User team', 'user_10', '[]', '[]', '[]', '[]', '[]', 2, 'CLOSED', 0, 0, '[]', '[]', '[]', 'team-from-user')
                """.trimIndent(),
            )
            database.execSQL(
                """
                INSERT INTO `UserData` (
                    `firstName`, `lastName`, `teamIds`, `friendIds`, `friendRequestIds`,
                    `friendRequestSentIds`, `followingIds`, `blockedUserIds`, `hiddenEventIds`,
                    `userName`, `uploadedImages`, `isMinor`, `isIdentityHidden`,
                    `notificationSettings`, `id`
                ) VALUES
                    ('Exact', 'User', '["team-from-user"]', '[]', '[]', '[]', '[]', '[]', '[]', 'user_10', '[]', 0, 0, '{}', 'user_10'),
                    ('Existing', 'User', '[]', '[]', '[]', '[]', '[]', '[]', '[]', 'existing_user', '[]', 0, 0, '{}', 'existing_user')
                """.trimIndent(),
            )
            database.execSQL(
                "INSERT INTO `ChatGroup` (`id`, `name`, `userIds`, `hostId`, `displayName`) VALUES ('chat-array', 'Array chat', '[\"user_10\",\"missing_chat_user\"]', 'user_10', '')",
            )
            database.execSQL(
                "INSERT INTO `team_user_cross_ref` (`teamId`, `userId`) VALUES ('team-array', 'existing_user')",
            )
            database.execSQL(
                "INSERT INTO `chat_user_cross_ref` (`chatId`, `userId`) VALUES ('chat-array', 'existing_user')",
            )
        }

        migrationHelper.runMigrationsAndValidate(
            databaseName,
            MVP_DATABASE_VERSION,
            true,
            *MVP_DATABASE_MIGRATIONS,
        ).use { database ->
            database.query(
                "SELECT `teamId`, `userId` FROM `team_user_cross_ref` ORDER BY `teamId`, `userId`",
            ).use { cursor ->
                val pairs = buildList {
                    while (cursor.moveToNext()) add("${cursor.getString(0)}:${cursor.getString(1)}")
                }
                assertEquals(
                    listOf(
                        "team-array:existing_user",
                        "team-array:missing_user",
                        "team-array:user_10",
                        "team-from-user:user_10",
                    ),
                    pairs,
                )
            }
            database.query(
                "SELECT `userId` FROM `team_pending_player_cross_ref` WHERE `teamId` = 'team-array'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals("missing_pending", cursor.getString(0))
            }
            database.query(
                "SELECT `userId` FROM `chat_user_cross_ref` WHERE `chatId` = 'chat-array' ORDER BY `userId`",
            ).use { cursor ->
                val ids = buildList { while (cursor.moveToNext()) add(cursor.getString(0)) }
                assertEquals(listOf("existing_user", "missing_chat_user", "user_10"), ids)
            }

            assertColumnAbsent(database, "Team", "playerIds")
            assertColumnAbsent(database, "Team", "pending")
            assertColumnAbsent(database, "ChatGroup", "userIds")
            assertColumnAbsent(database, "UserData", "teamIds")
            assertForeignKeyParents(database, "team_user_cross_ref", listOf("Team"))
            assertForeignKeyParents(database, "team_pending_player_cross_ref", listOf("Team"))
            assertForeignKeyParents(database, "chat_user_cross_ref", listOf("ChatGroup"))

            database.execSQL("PRAGMA foreign_keys = ON")
            database.execSQL(
                "INSERT INTO `team_user_cross_ref` (`teamId`, `userId`) VALUES ('team-array', 'arrived-before-profile')",
            )
            database.execSQL("DELETE FROM `Team` WHERE `id` = 'team-array'")
            database.query(
                "SELECT COUNT(*) FROM `team_user_cross_ref` WHERE `teamId` = 'team-array'",
            ).use { cursor ->
                assertTrue(cursor.moveToFirst())
                assertEquals(0, cursor.getInt(0))
            }
        }
    }

    @Test
    fun membershipDaos_reconstructMissingProfilesAndRollbackRejectedReplacements() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            val originalTeam = Team(
                id = "team_exact",
                division = "OPEN",
                name = "Original team",
                captainId = "user_10",
                managerId = "user_10",
                playerIds = listOf("user_10", "missing_user"),
                pending = listOf("missing_pending"),
                playerRegistrations = listOf(
                    TeamPlayerRegistration(
                        id = "registration-user-10",
                        teamId = "team_exact",
                        userId = "user_10",
                        status = "ACTIVE",
                        isCaptain = true,
                    ),
                    TeamPlayerRegistration(
                        id = "registration-missing-started",
                        teamId = "team_exact",
                        userId = "missing_user",
                        status = "STARTED",
                        consentStatus = "sent",
                    ),
                    TeamPlayerRegistration(
                        id = "registration-missing-pending",
                        teamId = "team_exact",
                        userId = "missing_pending",
                        status = "INVITED",
                    ),
                ),
                teamSize = 3,
            )
            database.getTeamDao.upsertTeamWithRelations(originalTeam)

            val roomReadTeam = database.getTeamDao.getTeam("team_exact")
            database.getTeamDao.upsertTeamWithRelations(roomReadTeam.copy(name = "Room-read team"))
            val roomReadRewrite = database.getTeamDao.getTeam("team_exact")
            assertEquals(setOf("user_10", "missing_user"), roomReadRewrite.playerIds.toSet())
            assertEquals(listOf("missing_pending"), roomReadRewrite.pending)
            assertEquals(
                "ACTIVE" to "sent",
                roomReadRewrite.playerRegistrations
                    .single { it.userId == "missing_user" }
                    .let { it.normalizedStatus() to it.consentStatus },
            )

            assertTrue(database.getTeamDao.getTeamsForUser("user_1").isEmpty())
            assertEquals(
                listOf("team_exact"),
                database.getTeamDao.getTeamsForUser("user_10").map(Team::id),
            )
            assertEquals(
                setOf("user_10", "missing_user"),
                database.getTeamDao.getTeam("team_exact").playerIds.toSet(),
            )

            database.getUserDataDao.upsertUserWithRelations(relationshipTestUser("user_10"))
            assertEquals(
                listOf("team_exact"),
                database.getUserDataDao.getUserDataById("user_10")?.teamIds,
            )
            val teamWithPlayers = database.getTeamDao.getTeamWithPlayers("team_exact")
            assertEquals(setOf("user_10", "missing_user"), teamWithPlayers.team.playerIds.toSet())
            assertEquals(listOf("user_10"), teamWithPlayers.players.map(UserData::id))

            val originalChat = ChatGroup(
                id = "chat_exact",
                name = "Original chat",
                userIds = listOf("user_10", "missing_chat_user"),
                hostId = "user_10",
            )
            database.getChatGroupDao.upsertChatGroupWithRelations(originalChat)
            assertTrue(database.getChatGroupDao.getChatGroupsByUserId("user_1").isEmpty())
            assertEquals(
                setOf("user_10", "missing_chat_user"),
                database.getChatGroupDao.getChatGroupsByUserId("missing_chat_user").single().userIds.toSet(),
            )
            val chatWithRelations = database.getChatGroupDao.getChatGroupWithRelations("missing_chat_user")
            assertEquals(setOf("user_10", "missing_chat_user"), chatWithRelations.chatGroup.userIds.toSet())
            assertEquals(listOf("user_10"), chatWithRelations.users.map(UserData::id))

            val canonicalReplacement = database.getTeamDao.getTeam("team_exact").copy(
                name = "Canonical replacement",
                playerIds = listOf("replacement_user"),
                pending = listOf("replacement_pending"),
            )
            database.getTeamDao.upsertTeamWithRelations(canonicalReplacement)
            val replacedTeam = database.getTeamDao.getTeam("team_exact")
            assertEquals("Canonical replacement", replacedTeam.name)
            assertEquals(listOf("replacement_user"), replacedTeam.playerIds)
            assertEquals(listOf("replacement_pending"), replacedTeam.pending)
            val resynchronizedReplacement = replacedTeam.withSynchronizedMembership()
            assertEquals(listOf("replacement_user"), resynchronizedReplacement.playerIds)
            assertEquals(listOf("replacement_pending"), resynchronizedReplacement.pending)

            database.openHelper.writableDatabase.execSQL(
                """
                CREATE TRIGGER reject_team_membership
                BEFORE INSERT ON team_user_cross_ref
                WHEN NEW.userId = 'reject_user'
                BEGIN
                    SELECT RAISE(ABORT, 'rejected team membership');
                END
                """.trimIndent(),
            )
            assertFails {
                database.getTeamDao.upsertTeamWithRelations(
                    replacedTeam.copy(
                        name = "Partially changed team",
                        playerIds = listOf("replacement_user", "reject_user"),
                    ),
                )
            }
            val rolledBackTeam = database.getTeamDao.getTeam("team_exact")
            assertEquals("Canonical replacement", rolledBackTeam.name)
            assertEquals(listOf("replacement_user"), rolledBackTeam.playerIds)
            assertEquals(listOf("replacement_pending"), rolledBackTeam.pending)

            database.openHelper.writableDatabase.execSQL(
                """
                CREATE TRIGGER reject_chat_membership
                BEFORE INSERT ON chat_user_cross_ref
                WHEN NEW.userId = 'reject_user'
                BEGIN
                    SELECT RAISE(ABORT, 'rejected chat membership');
                END
                """.trimIndent(),
            )
            assertFails {
                database.getChatGroupDao.upsertChatGroupWithRelations(
                    originalChat.copy(
                        name = "Partially changed chat",
                        userIds = listOf("replacement_user", "reject_user"),
                    ),
                )
            }
            val rolledBackChat = database.getChatGroupDao
                .getChatGroupsByUserId("missing_chat_user")
                .single()
            assertEquals("Original chat", rolledBackChat.name)
            assertEquals(setOf("user_10", "missing_chat_user"), rolledBackChat.userIds.toSet())
        } finally {
            database.close()
        }
    }

    @Test
    fun matchOperationOutboxDao_prunes_old_acknowledgements_but_retains_the_sequence_sentinel() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            val acknowledged = (1L..3L).map { sequence ->
                MatchOperationOutboxEntry(
                    id = "device-1:match-1:$sequence",
                    eventId = "event-1",
                    matchId = "match-1",
                    operationKind = "SCORE_SET",
                    payloadJson = "{}",
                    status = MATCH_OPERATION_STATUS_ACKED,
                    sourceDevice = "PHONE",
                    clientDeviceId = "device-1",
                    clientSequence = sequence,
                    clientCreatedAt = "2026-01-0${sequence}T00:00:00Z",
                    ackedAt = "2026-01-0${sequence}T00:01:00Z",
                )
            }
            database.getMatchOperationOutboxDao.upsertOperations(acknowledged)

            database.getMatchOperationOutboxDao.deleteAckedOlderThan("2026-02-01T00:00:00Z")

            assertEquals(
                listOf(3L),
                database.getMatchOperationOutboxDao
                    .getOperationsByIds(acknowledged.map(MatchOperationOutboxEntry::id))
                    .map(MatchOperationOutboxEntry::clientSequence),
            )
            assertEquals(3L, database.getMatchOperationOutboxDao.maxClientSequence())
        } finally {
            database.close()
        }
    }

    @Test
    fun messageDao_orders_cached_messages_by_time_then_id() = runBlocking {
        val database = Room.inMemoryDatabaseBuilder<MVPDatabaseService>(
            InstrumentationRegistry.getInstrumentation().targetContext,
        ).allowMainThreadQueries().build()

        try {
            database.getMessageDao.upsertMessages(
                listOf(
                    MessageMVP(
                        id = "message_z",
                        userId = "user_1",
                        body = "later",
                        attachmentUrls = emptyList(),
                        chatId = "chat_1",
                        readByIds = emptyList(),
                        sentTime = Instant.parse("2026-07-12T12:01:00Z"),
                    ),
                    MessageMVP(
                        id = "message_b",
                        userId = "user_1",
                        body = "tie second",
                        attachmentUrls = emptyList(),
                        chatId = "chat_1",
                        readByIds = emptyList(),
                        sentTime = Instant.parse("2026-07-12T12:00:00Z"),
                    ),
                    MessageMVP(
                        id = "message_a",
                        userId = "user_2",
                        body = "tie first",
                        attachmentUrls = emptyList(),
                        chatId = "chat_1",
                        readByIds = emptyList(),
                        sentTime = Instant.parse("2026-07-12T12:00:00Z"),
                    ),
                    MessageMVP(
                        id = "other_chat",
                        userId = "user_1",
                        body = "ignore",
                        attachmentUrls = emptyList(),
                        chatId = "chat_2",
                        readByIds = emptyList(),
                        sentTime = Instant.parse("2026-07-12T11:59:00Z"),
                    ),
                ),
            )

            assertEquals(
                listOf("message_a", "message_b", "message_z"),
                database.getMessageDao.getMessagesInChatGroup("chat_1").map { message -> message.id },
            )
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
                listOf(34, 35, 90, 91, 92) +
                legacyFixtureSourceVersions.sorted()
    }
}

private fun relationshipTestUser(id: String): UserData = UserData(
    id = id,
    firstName = "Test",
    lastName = "User",
    teamIds = emptyList(),
    friendIds = emptyList(),
    friendRequestIds = emptyList(),
    friendRequestSentIds = emptyList(),
    followingIds = emptyList(),
    userName = id,
    hasStripeAccount = false,
    uploadedImages = emptyList(),
)

private fun assertColumnAbsent(
    database: androidx.sqlite.db.SupportSQLiteDatabase,
    tableName: String,
    columnName: String,
) {
    database.query("PRAGMA table_info(`$tableName`)").use { cursor ->
        while (cursor.moveToNext()) {
            check(cursor.getString(1) != columnName) { "Expected $tableName.$columnName to be removed." }
        }
    }
}

private fun assertForeignKeyParents(
    database: androidx.sqlite.db.SupportSQLiteDatabase,
    tableName: String,
    expectedParents: List<String>,
) {
    database.query("PRAGMA foreign_key_list(`$tableName`)").use { cursor ->
        val parents = buildList { while (cursor.moveToNext()) add(cursor.getString(2)) }
        assertEquals(expectedParents, parents)
    }
}
