package com.razumly.mvp.core.data

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.razumly.mvp.core.data.dataTypes.ChatGroup
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamPlayerRegistration
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.normalizedStatus
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails
import kotlin.test.assertTrue
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MembershipDaoBehaviorTest {

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
