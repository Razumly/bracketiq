package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventDtosTest {
    @Test
    fun to_update_dto_trims_and_deduplicates_required_template_ids() {
        val event = Event(
            name = "League Event",
            eventType = EventType.LEAGUE,
            hostId = "host-1",
            noFixedEndDateTime = true,
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
        )

        val dto = event.toUpdateDto(
            requiredTemplateIdsOverride = listOf(" template-a ", "", "template-a", "template-b "),
        )

        assertEquals(listOf("template-a", "template-b"), dto.requiredTemplateIds)
        assertEquals(true, dto.noFixedEndDateTime)
    }

    @Test
    fun to_update_dto_uses_event_required_template_ids_when_override_is_not_provided() {
        val event = Event(
            name = "Regular Event",
            eventType = EventType.EVENT,
            hostId = "host-2",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            requiredTemplateIds = listOf(" template-c ", "", "template-c", "template-d "),
        )

        val dto = event.toUpdateDto()

        assertEquals(listOf("template-c", "template-d"), dto.requiredTemplateIds)
    }

    @Test
    fun to_update_dto_includes_league_scoring_config_when_override_is_provided() {
        val event = Event(
            name = "League Event",
            eventType = EventType.LEAGUE,
            hostId = "host-3",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
        )
        val scoring = LeagueScoringConfigDTO(
            pointsForWin = 3,
            pointsForLoss = 0,
        )

        val dto = event.toUpdateDto(leagueScoringConfigOverride = scoring)

        assertEquals(scoring, dto.leagueScoringConfig)
    }

    @Test
    fun to_update_dto_omits_league_scoring_config_when_override_is_not_provided() {
        val event = Event(
            name = "Tournament Event",
            eventType = EventType.TOURNAMENT,
            hostId = "host-4",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
        )

        val dto = event.toUpdateDto()

        assertNull(dto.leagueScoringConfig)
    }

    @Test
    fun to_update_dto_normalizes_division_details_for_backend_patch_contract() {
        val event = Event(
            id = "event-9",
            name = "Division Event",
            eventType = EventType.LEAGUE,
            hostId = "host-9",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            divisions = listOf("Open", "event-9__division__c_skill_b"),
            divisionDetails = emptyList(),
        )

        val dto = event.toUpdateDto()

        assertEquals(listOf("open", "event-9__division__c_skill_b"), dto.divisions)
        assertEquals(2, dto.divisionDetails.size)
        assertTrue(dto.divisionDetails.any { it.id == "event-9__division__open" && it.key == "open" })
        assertTrue(dto.divisionDetails.any { it.id == "event-9__division__c_skill_b" && it.key == "c_skill_b" })
    }

    @Test
    fun event_api_dto_maps_division_details_without_dropping_ids() {
        val dto = EventApiDto(
            id = "event-11",
            name = "API Event",
            hostId = "host-11",
            noFixedEndDateTime = true,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            divisions = listOf("event-11__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-11__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                )
            ),
        )

        val event = dto.toEventOrNull()

        assertEquals(listOf("event-11__division__open"), event?.divisions)
        assertEquals("Open", event?.divisionDetails?.firstOrNull()?.name)
        assertEquals(true, event?.noFixedEndDateTime)
    }
}
