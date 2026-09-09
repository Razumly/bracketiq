package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventAuthorityCapabilities
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventAuthoritySessionTest {
    @Test
    fun given_cached_grant_when_refresh_is_delayed_failed_or_revoked_then_management_stays_closed() = runTest {
        for (type in EventType.entries) {
            val cached = Event(id = "external", eventType = type, state = "TEMPLATE",
                affiliateUrl = "https://organizer.example/register",
                capabilities = EventAuthorityCapabilities(viewerUserId = "viewer", canEdit = true, readOnly = false))
            val session = EventAuthoritySession()
            fun hasManagement(event: Event = cached): Boolean {
                val presentation = buildEventDetailAccessPresentation(
                    EventWithFullRelations(event, emptyList(), emptyList(), emptyList()), event, emptyList(),
                    UserData().copy(id = "viewer"), null, true, true, session.isVerified(event, "viewer"),
                )
                return presentation.canEditEventDetails || presentation.canManageParticipantsFromDock ||
                    presentation.canManageMatchEditingFromDock || presentation.canDeleteEvent
            }
            assertFalse(hasManagement())
            val pending = CompletableDeferred<Result<Event>>()
            val refresh = launch { session.refresh(cached.id, "viewer") { pending.await() } }
            runCurrent()
            assertFalse(hasManagement())
            pending.complete(Result.failure(IllegalStateException("offline")))
            refresh.join()
            assertFalse(hasManagement())
            session.refresh(cached.id, "viewer") { Result.success(cached) }
            assertTrue(hasManagement())
            assertFalse(session.isVerified(cached, "another-viewer"))
            val revoked = cached.copy(capabilities = cached.capabilities!!.copy(canEdit = false, readOnly = true))
            session.refresh(cached.id, "viewer") { Result.success(revoked) }
            assertFalse(hasManagement(cached))
            assertFalse(hasManagement(revoked))
        }
    }

    @Test
    fun given_overlapping_refreshes_when_an_old_grant_returns_last_then_it_cannot_replace_revocation() = runTest {
        val session = EventAuthoritySession()
        val grant = Event(id = "external", capabilities = EventAuthorityCapabilities(
            viewerUserId = "viewer", canEdit = true, readOnly = false))
        val pending = CompletableDeferred<Result<Event>>()
        val old = launch { session.refresh(grant.id, "viewer") { pending.await() } }
        runCurrent()
        val denied = grant.copy(capabilities = grant.capabilities!!.copy(canEdit = false, readOnly = true))
        session.refresh(grant.id, "viewer") { Result.success(denied) }
        pending.complete(Result.success(grant))
        old.join()
        assertFalse(session.isVerified(grant, "viewer"))
        assertTrue(session.isVerified(denied, "viewer"))
    }
}
