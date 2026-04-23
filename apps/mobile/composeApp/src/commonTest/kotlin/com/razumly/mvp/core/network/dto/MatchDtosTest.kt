package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchOfficialAssignment
import com.razumly.mvp.core.data.dataTypes.OfficialAssignmentHolderType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

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
}
