package com.razumly.mvp.core.network.dto

import kotlinx.serialization.json.JsonNull
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class ExplicitNullPatchTest {
    @Test
    fun event_patch_emits_only_requested_changed_nullable_fields_as_json_null() {
        val previous = encodeExplicitNullPatchObject(
            serializer = EventUpdateDto.serializer(),
            value = EventUpdateDto(address = "123 Main St", minAge = 12, sportId = "volleyball"),
        )
        val updated = encodeExplicitNullPatchObject(
            serializer = EventUpdateDto.serializer(),
            value = EventUpdateDto(minAge = 12),
        )

        val clearFields = explicitNullFieldsForPatch(
            previous = previous,
            updated = updated,
            clearableFields = setOf("address", "minAge", "sportId"),
        )
        val payload = encodeExplicitNullPatchObject(
            serializer = EventUpdateDto.serializer(),
            value = EventUpdateDto(minAge = 12),
            explicitNullFields = clearFields,
        )

        assertEquals(setOf("address", "sportId"), clearFields)
        assertEquals(JsonNull, payload["address"])
        assertEquals(JsonNull, payload["sportId"])
        assertFalse("minAge" in payload && payload["minAge"] == JsonNull)
    }

    @Test
    fun team_and_bulk_match_patch_payloads_preserve_requested_null_clears() {
        val previousTeam = encodeExplicitNullPatchObject(
            serializer = TeamUpdateDto.serializer(),
            value = TeamUpdateDto(headCoachId = "coach_1", affiliateUrl = "https://example.test/register"),
        )
        val updatedTeam = encodeExplicitNullPatchObject(
            serializer = TeamUpdateDto.serializer(),
            value = TeamUpdateDto(),
        )
        val teamClearFields = explicitNullFieldsForPatch(
            previous = previousTeam,
            updated = updatedTeam,
            clearableFields = setOf("headCoachId", "affiliateUrl"),
        )
        val teamPayload = encodeExplicitNullPatchObject(
            serializer = TeamUpdateDto.serializer(),
            value = TeamUpdateDto(),
            explicitNullFields = teamClearFields,
        )

        val previousMatch = encodeExplicitNullPatchObject(
            serializer = BulkMatchUpdateEntryDto.serializer(),
            value = BulkMatchUpdateEntryDto(id = "match_1", fieldId = "field_1"),
        )
        val updatedMatch = encodeExplicitNullPatchObject(
            serializer = BulkMatchUpdateEntryDto.serializer(),
            value = BulkMatchUpdateEntryDto(id = "match_1"),
        )
        val matchClearFields = explicitNullFieldsForPatch(
            previous = previousMatch,
            updated = updatedMatch,
            clearableFields = setOf("fieldId"),
        )
        val matchPayload = encodeExplicitNullPatchObject(
            serializer = BulkMatchUpdateEntryDto.serializer(),
            value = BulkMatchUpdateEntryDto(id = "match_1"),
            explicitNullFields = matchClearFields,
        )

        assertEquals(JsonNull, teamPayload["headCoachId"])
        assertEquals(JsonNull, teamPayload["affiliateUrl"])
        assertEquals(JsonNull, matchPayload["fieldId"])
    }
}
