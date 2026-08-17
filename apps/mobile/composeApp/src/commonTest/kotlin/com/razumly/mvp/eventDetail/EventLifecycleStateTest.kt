package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.isDraftLikeState
import com.razumly.mvp.core.data.dataTypes.isPrivateState
import com.razumly.mvp.core.data.dataTypes.lifecycleStateLabel
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventLifecycleStateTest {
    @Test
    fun private_events_use_private_label_without_becoming_draft_like() {
        val event = Event(name = "Private Event", state = "PRIVATE")

        assertTrue(event.isPrivateState())
        assertFalse(event.isDraftLikeState())
        assertEquals("Private", event.lifecycleStateLabel())
    }

    @Test
    fun editable_lifecycle_state_preserves_private_and_legacy_draft_mapping() {
        val privateEvent = Event(name = "Private Event", state = "PRIVATE")
        val unpublishedEvent = Event(name = "Draft Event", state = "UNPUBLISHED")
        val legacyDraftEvent = Event(name = "Legacy Draft Event", state = "DRAFT")
        val publishedEvent = Event(name = "Published Event", state = "PUBLISHED")

        assertEquals(EditableLifecycleState.PRIVATE, privateEvent.toEditableLifecycleState())
        assertEquals("PRIVATE", EditableLifecycleState.PRIVATE.toEventState(privateEvent.state))

        assertEquals(EditableLifecycleState.DRAFT, unpublishedEvent.toEditableLifecycleState())
        assertEquals("UNPUBLISHED", EditableLifecycleState.DRAFT.toEventState(unpublishedEvent.state))

        assertEquals(EditableLifecycleState.DRAFT, legacyDraftEvent.toEditableLifecycleState())
        assertEquals("DRAFT", EditableLifecycleState.DRAFT.toEventState(legacyDraftEvent.state))

        assertEquals(EditableLifecycleState.PUBLISHED, publishedEvent.toEditableLifecycleState())
        assertEquals("PUBLISHED", EditableLifecycleState.PUBLISHED.toEventState(publishedEvent.state))
    }
}
