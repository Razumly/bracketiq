package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.EventEditorStaffInviteDto
import com.razumly.mvp.core.network.dto.completeEventEditorWireFixtures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

class EventEditorCoverageRoundTripTest {
    @Test
    fun tryout_retains_an_assistant_host_invitation_with_only_canonical_roles() {
        val snapshot = editorProtocolSnapshot(mode = "EDIT")
        val draft = snapshot.draft.copy(
            basics = snapshot.draft.basics.copy(eventType = "TRYOUT"),
            staff = snapshot.draft.staff.copy(pendingInvites = listOf(
                EventEditorStaffInviteDto(email = "assistant@example.test", roles = listOf("ASSISTANT_HOST")),
                EventEditorStaffInviteDto(email = "official@example.test", roles = listOf("OFFICIAL")),
            )),
        )
        val session = EventEditorSessionMapper.fromEditSnapshot(snapshot.copy(draft = draft))
        val command = EventEditorSessionMapper.toSaveCommand(session, EventEditorMutation(session.canonicalState))
        val invite = command.draft.staff.pendingInvites.single()
        assertEquals("assistant@example.test", invite.email)
        assertEquals(listOf("ASSISTANT_HOST"), invite.roles)
        assertEquals(listOf("ASSISTANT_HOST"), invite.staffTypes)
    }

    @Test
    fun unchanged_editor_state_preserves_the_complete_shared_draft() {
        val json = Json
        val fixtures = json.parseToJsonElement(completeEventEditorWireFixtures).jsonObject
        val snapshot = json.decodeFromJsonElement<EventEditorSnapshotDto>(fixtures.getValue("results").jsonArray[0].jsonObject.getValue("value").jsonObject.getValue("snapshot"))
        fixtures.getValue("cases").jsonArray.forEach { entry ->
            val draft = json.decodeFromJsonElement<EventEditorDraftDto>(entry.jsonObject.getValue("command").jsonObject.getValue("draft"))
            val session = EventEditorSessionMapper.fromEditSnapshot(snapshot.copy(draft = draft))
            val command = EventEditorSessionMapper.toSaveCommand(session, EventEditorMutation(session.canonicalState))
            assertEquals(draft, command.draft, entry.jsonObject.getValue("name").toString())
        }
    }
}
