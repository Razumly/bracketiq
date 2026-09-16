package com.razumly.mvp.teamManagement

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.db.MVPDatabaseService
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class InvitationRoomPersistenceTest {
    private lateinit var context: Context
    private val databaseName = "issue-149-invitation-room"
    @Before fun setUp() {
        context = RuntimeEnvironment.getApplication().applicationContext as Context
        context.deleteDatabase(databaseName)
    }
    @After fun tearDown() { context.deleteDatabase(databaseName) }
    private fun openDatabase(): MVPDatabaseService = Room.databaseBuilder<MVPDatabaseService>(context, databaseName)
        .setJournalMode(RoomDatabase.JournalMode.TRUNCATE).allowMainThreadQueries().build()

    @Test fun retry_key_survives_restart_and_is_separate_for_each_account() = runTest {
        val first = openDatabase()
        try { assertEquals("first", first.getInviteDao.reserveOperation("manager", "draft", "first")) }
        finally { first.close() }
        val reopened = openDatabase()
        try {
            val dao = reopened.getInviteDao
            assertEquals("first", dao.reserveOperation("manager", "draft", "retry"))
            assertEquals("other", dao.reserveOperation("other-manager", "draft", "other"))
            dao.completeOperation("manager", "draft", "stale")
            assertEquals("first", dao.getOperationKey("manager", "draft"))
            dao.completeOperation("manager", "draft", "first")
            assertNull(dao.getOperationKey("manager", "draft"))
        } finally { reopened.close() }
    }

    @Test fun reinvite_and_late_old_response_leave_one_current_attempt_without_a_history_refresh() = runTest {
        val database = openDatabase()
        try {
            val dao = database.getInviteDao
            val old = Invite(id = "old", type = "TEAM", teamId = "team", userId = "player", viewerId = "manager", status = "DECLINED", createdAt = "2026-09-01T00:00:00Z", finalizedAt = "2026-09-01T01:00:00Z")
            val next = old.copy(id = "new", status = "PENDING", createdAt = "2026-09-02T00:00:00Z", finalizedAt = null)
            dao.saveInvitationAttempt(old)
            dao.saveInvitationAttempt(next)
            dao.saveInvitationAttempt(old)
            val history = dao.observeTeamInvitations("team", "manager").first()
            assertEquals(listOf("new"), history.filter { it.isCurrentAttempt }.map { it.id })
            assertEquals(old.finalizedAt, dao.getInvite("old")?.finalizedAt)
            assertFalse(dao.getInvite("old")!!.isCurrentAttempt)
            assertEquals(emptyList(), dao.observeTeamInvitations("team", "other-manager").first())
        } finally { database.close() }
    }

    @Test fun guardian_projection_is_not_visible_to_another_account() = runTest {
        val database = openDatabase()
        try {
            database.getInviteDao.upsertInvite(Invite(id = "child-invite", userId = "child", viewerId = "guardian", viewerCanAcceptForChild = true))
            assertEquals(1, database.getInviteDao.getRecipientInvitations("guardian", null).size)
            assertEquals(0, database.getInviteDao.getRecipientInvitations("other-guardian", null).size)
        } finally { database.close() }
    }
}
