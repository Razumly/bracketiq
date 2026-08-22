package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.room.useReaderConnection
import androidx.room.useWriterConnection
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MessageMVP
import com.razumly.mvp.core.data.dataTypes.MATCH_OPERATION_STATUS_ACKED
import com.razumly.mvp.core.data.dataTypes.MatchOperationOutboxEntry
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.normalizedStatus
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.db.MVPDatabaseService
import com.razumly.mvp.core.db.MVP_DATABASE_VERSION
import kotlinx.coroutines.runBlocking
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertTrue
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RoomDatabaseBehaviorTest {


    @Test
    fun given_canonicalFacilityId_when_fieldDaoRoundTrips_then_returnsSameFacilityId() = runBlocking {
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
    fun given_missingProfilesAndRejectedReplacements_when_membershipDaosRun_then_reconstructAndRollback() = runBlocking {
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
    fun given_oldAcknowledgements_when_outboxDaoPrunes_then_retainsSequenceSentinel() = runBlocking {
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
    fun given_sameTimestampCachedMessages_when_messageDaoOrders_then_sortsById() = runBlocking {
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
    fun given_older_cache_version_when_database_reopens_then_room_recreates_cache() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val databaseName = "room-destructive-upgrade"
        context.deleteDatabase(databaseName)

        fun openDatabase() =
            Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
                .setDriver(BundledSQLiteDriver())
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()

        val original = openDatabase()
        try {
            runBlocking {
                original.useWriterConnection { connection ->
                    connection.usePrepared(
                        "CREATE TABLE `room_upgrade_sentinel` (`id` INTEGER NOT NULL PRIMARY KEY)",
                    ) { statement ->
                        statement.step()
                    }
                    connection.usePrepared(
                        "PRAGMA user_version = ${MVP_DATABASE_VERSION - 1}",
                    ) { statement ->
                        statement.step()
                    }
                }
            }
        } finally {
            original.close()
        }

        val reopened = openDatabase()
        try {
            val sentinelExists = runBlocking {
                reopened.useReaderConnection { connection ->
                    connection.usePrepared(
                        "SELECT `name` FROM `sqlite_master` WHERE `type` = 'table' AND `name` = 'room_upgrade_sentinel'",
                    ) { statement ->
                        statement.step()
                    }
                }
            }
            assertTrue(sentinelExists.not())
        } finally {
            reopened.close()
            context.deleteDatabase(databaseName)
        }
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


