package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class MatchDtosTest {
    @Test
    fun match_api_dto_maps_structured_official_assignments() {
        val dto = MatchApiDto(
            id = "match-1",
            matchId = 1,
            eventId = "event-1",
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "position-r1",
                    slotIndex = 0,
                    holderType = OfficialAssignmentHolderType.OFFICIAL,
                    userId = "official-1",
                    eventOfficialId = "event-official-1",
                    checkedIn = true,
                ),
            ),
        )

        val match = dto.toMatchOrNull()

        assertNotNull(match)
        assertEquals(listOf("official-1"), match.officialIds.map(MatchOfficialAssignment::userId))
        assertEquals(true, match.officialIds.single().checkedIn)
    }

    @Test
    fun bulk_match_update_entry_includes_structured_official_assignments() {
        val match = MatchMVP(
            id = "match-2",
            eventId = "event-2",
            matchId = 2,
            officialIds = listOf(
                MatchOfficialAssignment(
                    positionId = "position-line",
                    slotIndex = 1,
                    holderType = OfficialAssignmentHolderType.PLAYER,
                    userId = "player-1",
                    checkedIn = false,
                ),
            ),
        )

        val dto = match.toBulkMatchUpdateEntryDto()

        assertEquals(listOf("player-1"), dto.officialIds?.map(MatchOfficialAssignment::userId))
        assertEquals(OfficialAssignmentHolderType.PLAYER, dto.officialIds?.single()?.holderType)
    }

    @Test
    fun match_api_dto_uses_embedded_field_id_when_scalar_field_id_is_missing() {
        val dto = MatchApiDto(
            id = "match-3",
            matchId = 3,
            eventId = "event-3",
            field = MatchEmbeddedFieldDto(
                id = "field-7",
                name = "Field 7",
            ),
        )

        val match = dto.toMatchOrNull()

        assertNotNull(match)
        assertEquals("field-7", match.fieldId)
    }

    @Test
    fun match_api_dto_decodes_object_segment_metadata() {
        val response = jsonMVP.decodeFromString<MatchResponseDto>(
            """
            {
              "match": {
                "id": "match-4",
                "matchId": 4,
                "eventId": "event-4",
                "segments": [
                  {
                    "id": "segment-1",
                    "matchId": "match-4",
                    "sequence": 1,
                    "metadata": {
                      "source": "mobile",
                      "clientOperation": {
                        "id": "op-1",
                        "sequence": 6
                      }
                    }
                  }
                ]
              }
            }
            """.trimIndent(),
        )

        val match = response.match?.toMatchOrNull()

        assertNotNull(match)
        val metadata = match.segments.single().metadata
        assertEquals("mobile", metadata?.get("source"))
        assertTrue(metadata?.get("clientOperation")?.contains("\"id\":\"op-1\"") == true)
    }

    @Test
    fun embedded_field_dto_only_maps_to_field_when_required_field_data_exists() {
        val partialField = MatchEmbeddedFieldDto(
            id = "field-7",
            name = "Field 7",
        )
        val completeField = MatchEmbeddedFieldDto(
            id = "field-8",
            fieldNumber = 8,
            name = "Field 8",
        )

        assertEquals(null, partialField.toFieldOrNull())
        assertEquals(
            Field(
                id = "field-8",
                fieldNumber = 8,
                inUse = null,
                name = "Field 8",
            ),
            completeField.toFieldOrNull(),
        )
    }

    @Test
    fun match_operations_json_includes_explicit_nulls_for_timer_reset() {
        val payload = MatchUpdateDto(
            lifecycle = MatchLifecycleOperationDto(
                status = "SCHEDULED",
                clearActualStart = true,
                clearActualEnd = true,
            ),
            segmentOperations = listOf(
                MatchSegmentOperationDto(
                    id = "segment-1",
                    sequence = 1,
                    status = "NOT_STARTED",
                    scores = mapOf("team-1" to 1, "team-2" to 0),
                    clearStartedAt = true,
                    clearEndedAt = true,
                ),
            ),
        ).toMatchOperationsJsonObject()

        val encoded = jsonMVP.encodeToString(JsonObject.serializer(), payload)
        val lifecycle = payload["lifecycle"] as JsonObject
        val segment = (payload["segmentOperations"] as kotlinx.serialization.json.JsonArray).single() as JsonObject

        assertTrue("\"actualStart\":null" in encoded)
        assertTrue("\"startedAt\":null" in encoded)
        assertEquals(JsonNull, lifecycle["actualStart"])
        assertEquals(JsonNull, lifecycle["actualEnd"])
        assertEquals(JsonNull, segment["startedAt"])
        assertEquals(JsonNull, segment["endedAt"])
    }

    @Test
    fun match_operations_json_omits_nullable_timer_fields_without_clear_flags() {
        val payload = MatchUpdateDto(
            lifecycle = MatchLifecycleOperationDto(status = "IN_PROGRESS"),
            segmentOperations = listOf(
                MatchSegmentOperationDto(
                    sequence = 2,
                    status = "IN_PROGRESS",
                ),
            ),
        ).toMatchOperationsJsonObject()

        val encoded = jsonMVP.encodeToString(JsonObject.serializer(), payload)

        assertTrue("\"actualStart\"" !in encoded)
        assertTrue("\"startedAt\"" !in encoded)
    }
}
