package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant

class EventDtosTest {
    @Test
    fun to_update_dto_trims_and_deduplicates_required_template_ids() {
        val event = Event(
            name = "League Event",
            eventType = EventType.LEAGUE,
            hostId = "host-1",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
        )

        val dto = event.toUpdateDto(
            requiredTemplateIdsOverride = listOf(" template-a ", "", "template-a", "template-b "),
        )

        assertEquals(listOf("template-a", "template-b"), dto.requiredTemplateIds)
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
}
