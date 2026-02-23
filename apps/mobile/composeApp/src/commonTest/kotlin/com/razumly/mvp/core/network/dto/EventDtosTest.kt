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
    fun to_update_dto_includes_assistant_host_ids() {
        val event = Event(
            name = "Assistants Event",
            eventType = EventType.EVENT,
            hostId = "host-2",
            assistantHostIds = listOf("assistant-1", "assistant-2"),
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
        )

        val dto = event.toUpdateDto()

        assertEquals(listOf("assistant-1", "assistant-2"), dto.assistantHostIds)
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
    fun to_update_dto_mirrors_event_price_and_capacity_for_single_division_events() {
        val event = Event(
            id = "event-12",
            name = "Single Division Event",
            eventType = EventType.EVENT,
            hostId = "host-12",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            singleDivision = true,
            priceCents = 4200,
            maxParticipants = 18,
            divisions = listOf("event-12__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-12__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    price = 1000,
                    maxParticipants = 4,
                )
            ),
        )

        val dto = event.toUpdateDto()
        val detail = dto.divisionDetails.first()

        assertEquals(4200, detail.price)
        assertEquals(18, detail.maxParticipants)
    }

    @Test
    fun to_update_dto_keeps_division_price_and_capacity_for_multi_division_events() {
        val event = Event(
            id = "event-13",
            name = "Multi Division Event",
            eventType = EventType.EVENT,
            hostId = "host-13",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            singleDivision = false,
            priceCents = 0,
            maxParticipants = 50,
            divisions = listOf("event-13__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-13__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    price = 2500,
                    maxParticipants = 12,
                )
            ),
        )

        val dto = event.toUpdateDto()
        val detail = dto.divisionDetails.first()

        assertEquals(2500, detail.price)
        assertEquals(12, detail.maxParticipants)
    }

    @Test
    fun to_update_dto_uses_event_playoff_count_for_single_division_leagues() {
        val event = Event(
            id = "event-14",
            name = "Single Division League",
            eventType = EventType.LEAGUE,
            hostId = "host-14",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            singleDivision = true,
            includePlayoffs = true,
            playoffTeamCount = 8,
            maxParticipants = 24,
            divisions = listOf("event-14__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-14__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    playoffTeamCount = 4,
                ),
            ),
        )

        val dto = event.toUpdateDto()
        val detail = dto.divisionDetails.first()

        assertEquals(8, dto.playoffTeamCount)
        assertEquals(8, detail.playoffTeamCount)
    }

    @Test
    fun to_update_dto_keeps_division_playoff_count_for_multi_division_leagues() {
        val event = Event(
            id = "event-15",
            name = "Multi Division League",
            eventType = EventType.LEAGUE,
            hostId = "host-15",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            singleDivision = false,
            includePlayoffs = true,
            playoffTeamCount = 12,
            maxParticipants = 40,
            divisions = listOf("event-15__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-15__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 16,
                    playoffTeamCount = 6,
                ),
            ),
        )

        val dto = event.toUpdateDto()
        val detail = dto.divisionDetails.first()

        assertNull(dto.playoffTeamCount)
        assertEquals(6, detail.playoffTeamCount)
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

    @Test
    fun event_api_dto_maps_assistant_hosts_with_backward_compatible_default() {
        val missingAssistantHosts = EventApiDto(
            id = "event-17",
            name = "API Event",
            hostId = "host-17",
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
        ).toEventOrNull()

        val withAssistantHosts = EventApiDto(
            id = "event-18",
            name = "API Event",
            hostId = "host-18",
            assistantHostIds = listOf("assistant-1", "assistant-2"),
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
        ).toEventOrNull()

        assertEquals(emptyList(), missingAssistantHosts?.assistantHostIds)
        assertEquals(listOf("assistant-1", "assistant-2"), withAssistantHosts?.assistantHostIds)
    }

    @Test
    fun event_api_dto_applies_event_playoff_count_to_multi_division_details_when_missing() {
        val dto = EventApiDto(
            id = "event-16",
            name = "API League",
            hostId = "host-16",
            eventType = EventType.LEAGUE.name,
            includePlayoffs = true,
            singleDivision = false,
            playoffTeamCount = 10,
            maxParticipants = 24,
            noFixedEndDateTime = true,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            divisions = listOf("event-16__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-16__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 12,
                ),
            ),
        )

        val event = dto.toEventOrNull()

        assertEquals(null, event?.playoffTeamCount)
        assertEquals(10, event?.divisionDetails?.firstOrNull()?.playoffTeamCount)
    }
}
