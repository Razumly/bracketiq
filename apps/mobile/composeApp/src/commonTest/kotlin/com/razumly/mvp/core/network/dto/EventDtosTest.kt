package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.resolvedDivisionPriceCents
import com.razumly.mvp.core.data.dataTypes.toEventDTO
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

class EventDtosTest {
    @Test
    fun schedule_event_response_decodes_matches_with_partial_embedded_fields() {
        val response = jsonMVP.decodeFromString<ScheduleEventResponseDto>(
            """
                {
                  "preview": false,
                  "event": {
                    "id": "event_1",
                    "name": "Scheduled Event",
                    "hostId": "host_1",
                    "eventType": "LEAGUE",
                    "start": "2026-06-01T08:00:00Z",
                    "end": "2026-06-01T09:00:00Z",
                    "maxParticipants": 8
                  },
                  "matches": [
                    {
                      "id": "match_1",
                      "matchId": 1,
                      "eventId": "event_1",
                      "field": {
                        "id": "field_1",
                        "name": "Court 1"
                      }
                    }
                  ]
                }
            """.trimIndent(),
        )

        val match = response.matches.single().toMatchOrNull()

        assertNotNull(match)
        assertEquals("field_1", match.fieldId)
    }

    @Test
    fun event_api_dto_preserves_divisions_with_duplicate_type_ids() {
        val firstDivisionId = "event-dup__division__m_skill_open_age_18plus"
        val secondDivisionId = "event-dup_2__division__m_skill_open_age_18plus"

        val event = EventApiDto(
            id = "event-dup",
            name = "Example League",
            hostId = "host-1",
            eventType = "LEAGUE",
            start = "2026-06-01T08:00:00Z",
            end = "2026-06-01T09:00:00Z",
            singleDivision = false,
            divisions = listOf(firstDivisionId, secondDivisionId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = firstDivisionId,
                    key = "m_skill_open_age_18plus",
                    name = "Mens Open 18+ - A",
                    divisionTypeId = "skill_open_age_18plus",
                    gender = "M",
                    ratingType = "SKILL",
                    maxParticipants = 8,
                    price = 1000,
                ),
                DivisionDetail(
                    id = secondDivisionId,
                    key = "m_skill_open_age_18plus",
                    name = "Mens Open 18+ - B",
                    divisionTypeId = "skill_open_age_18plus",
                    gender = "M",
                    ratingType = "SKILL",
                    maxParticipants = 8,
                    price = 2000,
                ),
            ),
        ).toEventOrNull()

        assertNotNull(event)
        assertEquals(listOf(firstDivisionId, secondDivisionId), event.divisions)
        assertEquals(
            listOf("Mens Open 18+ - A", "Mens Open 18+ - B"),
            event.divisionDetails.map { detail -> detail.name },
        )
        assertEquals(2000, event.resolvedDivisionPriceCents(secondDivisionId))
    }

    @Test
    fun to_update_dto_trims_and_deduplicates_required_template_ids() {
        val event = Event(
            name = "League Event",
            eventType = EventType.LEAGUE,
            hostId = "host-1",
            noFixedEndDateTime = true,
            doTeamsOfficiate = true,
            teamOfficialsMaySwap = true,
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
        )

        val dto = event.toUpdateDto(
            requiredTemplateIdsOverride = listOf(" template-a ", "", "template-a", "template-b "),
        )

        assertEquals(listOf("template-a", "template-b"), dto.requiredTemplateIds)
        assertEquals(true, dto.noFixedEndDateTime)
        assertEquals("2023-11-14T23:13:20Z", dto.end)
        assertEquals(true, dto.teamOfficialsMaySwap)
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
    fun to_update_dto_includes_weekly_relative_installment_due_days() {
        val event = Event(
            id = "weekly-event-1",
            name = "Weekly Clinic",
            eventType = EventType.WEEKLY_EVENT,
            hostId = "host-weekly",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            singleDivision = false,
            priceCents = 6000,
            allowPaymentPlans = true,
            installmentCount = 2,
            installmentAmounts = listOf(3000, 3000),
            installmentDueRelativeDays = listOf(-1, 0),
            divisions = listOf("weekly-event-1__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "weekly-event-1__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    price = 6000,
                    allowPaymentPlans = true,
                    installmentCount = 2,
                    installmentAmounts = listOf(3000, 3000),
                    installmentDueRelativeDays = listOf(0, 7),
                ),
            ),
        )

        val dto = event.toUpdateDto()

        assertEquals(listOf(-1, 0), dto.installmentDueRelativeDays)
        assertEquals(listOf(0, 7), dto.divisionDetails.first().installmentDueRelativeDays)
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
    fun to_update_dto_includes_inline_fields_and_time_slots_when_overrides_are_provided() {
        val event = Event(
            name = "Inline Payload Event",
            eventType = EventType.LEAGUE,
            hostId = "host-inline",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
        )
        val fields = listOf(
            Field(
                fieldNumber = 1,
                divisions = listOf("open"),
                organizationId = "org-inline",
                id = "field-inline-1",
            ),
        )
        val timeSlots = listOf(
            TimeSlot(
                id = "slot-inline-1",
                dayOfWeek = 1,
                daysOfWeek = listOf(1),
                divisions = listOf("open"),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                startDate = Instant.fromEpochMilliseconds(1_700_000_000_000),
                repeating = true,
                endDate = null,
                scheduledFieldId = "field-inline-1",
                scheduledFieldIds = listOf("field-inline-1"),
                price = null,
            ),
        )

        val dto = event.toUpdateDto(
            fieldsOverride = fields,
            timeSlotsOverride = timeSlots,
        )

        assertEquals(fields, dto.fields)
        assertEquals(timeSlots, dto.timeSlots)
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
    fun to_update_dto_preserves_division_price_and_capacity_for_single_division_events() {
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

        assertEquals(1000, detail.price)
        assertEquals(4, detail.maxParticipants)
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

        assertEquals(12, dto.playoffTeamCount)
        assertEquals(6, detail.playoffTeamCount)
    }

    @Test
    fun to_update_dto_preserves_division_owned_league_and_playoff_config() {
        val event = Event(
            id = "event-15-config",
            name = "Division Config League",
            eventType = EventType.LEAGUE,
            hostId = "host-15",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            singleDivision = false,
            includePlayoffs = true,
            divisions = listOf("event-15-config__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "event-15-config__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 16,
                    playoffTeamCount = 6,
                    gamesPerOpponent = 2,
                    restTimeMinutes = 0,
                    usesSets = true,
                    setDurationMinutes = 0,
                    setsPerMatch = 3,
                    pointsToVictory = listOf(25, 25, 15),
                    playoffConfig = TournamentConfig(
                        usesSets = true,
                        winnerSetCount = 3,
                        winnerBracketPointsToVictory = listOf(25, 25, 15),
                        setDurationMinutes = 0,
                        restTimeMinutes = 0,
                    ),
                ),
            ),
        )

        val detail = event.toUpdateDto().divisionDetails.first()

        assertEquals(2, detail.gamesPerOpponent)
        assertEquals(0, detail.restTimeMinutes)
        assertEquals(true, detail.usesSets)
        assertEquals(0, detail.setDurationMinutes)
        assertEquals(listOf(25, 25, 15), detail.pointsToVictory)
        assertEquals(0, detail.playoffConfig?.setDurationMinutes)
        assertEquals(0, detail.playoffConfig?.restTimeMinutes)
        assertEquals(listOf(25, 25, 15), detail.playoffConfig?.winnerBracketPointsToVictory)
    }

    @Test
    fun to_update_dto_preserves_split_league_playoff_mapping_indexes() {
        val event = Event(
            id = "event-15b",
            name = "Mapped League",
            eventType = EventType.LEAGUE,
            hostId = "host-15b",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            singleDivision = false,
            includePlayoffs = true,
            divisions = listOf("division_a", "playoff_gold"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division_a",
                    key = "division_a",
                    name = "Division A",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    playoffTeamCount = 2,
                    playoffPlacementDivisionIds = listOf("playoff_gold", ""),
                ),
                DivisionDetail(
                    id = "playoff_gold",
                    key = "playoff_gold",
                    name = "Gold Playoff",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                ),
            ),
        )

        val dto = event.toUpdateDto()
        val detail = dto.divisionDetails.first { it.id == "division_a" }

        assertEquals(listOf("playoff_gold", ""), detail.playoffPlacementDivisionIds)
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
    fun event_api_dto_merges_tournament_playoff_division_details_for_registration_pricing() {
        val bracketId = "event-12__division__c_skill_open_age_18plus"
        val poolId = "${bracketId}_pool_a"
        val dto = EventApiDto(
            id = "event-12",
            name = "Pool Tournament",
            hostId = "host-12",
            eventType = EventType.TOURNAMENT.name,
            includePlayoffs = true,
            includePlayoffsOrPools = true,
            singleDivision = false,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            divisions = listOf(poolId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = poolId,
                    key = "c_skill_open_age_18plus_pool_a",
                    name = "CoEd Open 18+ Pool A",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 4,
                    playoffPlacementDivisionIds = listOf(bracketId),
                ),
            ),
            playoffDivisionDetails = listOf(
                DivisionDetail(
                    id = bracketId,
                    key = "c_skill_open_age_18plus",
                    name = "CoEd Open 18+",
                    kind = "",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    price = 4500,
                    maxParticipants = 16,
                ),
            ),
        )

        val event = dto.toEventOrNull()
        val bracketDetail = event?.divisionDetails?.firstOrNull { detail -> detail.id == bracketId }

        assertEquals(listOf(poolId), event?.divisions)
        assertEquals("PLAYOFF", bracketDetail?.kind)
        assertEquals(4500, bracketDetail?.price)
        assertEquals(4500, event?.resolvedDivisionPriceCents(bracketId))
    }

    @Test
    fun to_update_dto_sends_tournament_pool_bracket_details_as_playoff_details() {
        val bracketId = "event-12b__division__c_skill_open_age_18plus"
        val event = Event(
            id = "event-12b",
            name = "Pool Tournament",
            hostId = "host-12b",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            singleDivision = false,
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            divisions = listOf(bracketId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = bracketId,
                    key = "c_skill_open_age_18plus",
                    name = "CoEd Open 18+",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    maxParticipants = 16,
                    playoffTeamCount = 8,
                    poolCount = 2,
                    usesSets = true,
                    setDurationMinutes = 20,
                    setsPerMatch = 3,
                    pointsToVictory = listOf(25, 25, 15),
                    playoffConfig = TournamentConfig(
                        winnerSetCount = 3,
                        winnerBracketPointsToVictory = listOf(25, 25, 15),
                        setDurationMinutes = 20,
                        usesSets = true,
                    ),
                ),
            ),
        )

        val dto = event.toUpdateDto()
        val bracketDetail = dto.playoffDivisionDetails.single()

        assertEquals(emptyList(), dto.divisionDetails)
        assertEquals("PLAYOFF", bracketDetail.kind)
        assertEquals(bracketId, bracketDetail.id)
        assertEquals(2, bracketDetail.poolCount)
        assertEquals(8, bracketDetail.playoffTeamCount)
        assertEquals(3, bracketDetail.setsPerMatch)
        assertEquals(listOf(25, 25, 15), bracketDetail.pointsToVictory)
        assertEquals(3, bracketDetail.playoffConfig?.winnerSetCount)
        assertEquals(listOf(25, 25, 15), bracketDetail.playoffConfig?.winnerBracketPointsToVictory)
    }

    @Test
    fun event_api_dto_maps_weekly_relative_installment_due_days() {
        val dto = EventApiDto(
            id = "weekly-event-2",
            name = "Weekly API Event",
            hostId = "host-weekly",
            eventType = EventType.WEEKLY_EVENT.name,
            singleDivision = false,
            price = 9000,
            allowPaymentPlans = true,
            installmentCount = 3,
            installmentAmounts = listOf(3000, 3000, 3000),
            installmentDueRelativeDays = listOf(-1, 0, 7),
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            divisions = listOf("weekly-event-2__division__open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "weekly-event-2__division__open",
                    key = "open",
                    name = "Open",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    price = 9000,
                    allowPaymentPlans = true,
                    installmentCount = 3,
                    installmentAmounts = listOf(3000, 3000, 3000),
                    installmentDueRelativeDays = listOf(0, 7, 14),
                )
            ),
        )

        val event = dto.toEventOrNull()

        assertEquals(listOf(-1, 0, 7), event?.installmentDueRelativeDays)
        assertEquals(listOf(0, 7, 14), event?.divisionDetails?.firstOrNull()?.installmentDueRelativeDays)
    }

    @Test
    fun event_api_dto_preserves_split_league_playoff_mapping_in_division_details() {
        val dto = EventApiDto(
            id = "event-19",
            name = "API League",
            hostId = "host-19",
            eventType = EventType.LEAGUE.name,
            includePlayoffs = true,
            singleDivision = false,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            divisions = listOf("division_a", "playoff_gold"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division_a",
                    key = "division_a",
                    name = "Division A",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    playoffTeamCount = 2,
                    playoffPlacementDivisionIds = listOf(" playoff_gold ", ""),
                ),
                DivisionDetail(
                    id = "playoff_gold",
                    key = "playoff_gold",
                    name = "Gold Playoff",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                ),
            ),
        )

        val event = dto.toEventOrNull()
        val divisionA = event?.divisionDetails?.firstOrNull { it.id == "division_a" }

        assertEquals(listOf("playoff_gold", ""), divisionA?.playoffPlacementDivisionIds)
    }

    @Test
    fun event_api_dto_round_trips_division_owned_schedule_configs() {
        val dto = EventApiDto(
            id = "event-25",
            name = "Configured League",
            hostId = "host-25",
            eventType = EventType.LEAGUE.name,
            includePlayoffs = true,
            singleDivision = false,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            divisions = listOf("division_a"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "division_a",
                    key = "division_a",
                    name = "Division A",
                    divisionTypeId = "open",
                    divisionTypeName = "Open",
                    ratingType = "SKILL",
                    gender = "C",
                    gamesPerOpponent = 2,
                    restTimeMinutes = 15,
                    usesSets = true,
                    setDurationMinutes = 12,
                    setsPerMatch = 3,
                    pointsToVictory = listOf(25, 25, 15),
                    playoffConfig = TournamentConfig(
                        doubleElimination = true,
                        winnerSetCount = 3,
                        loserSetCount = 1,
                        winnerBracketPointsToVictory = listOf(25, 25, 15),
                        loserBracketPointsToVictory = listOf(21),
                        restTimeMinutes = 10,
                    ),
                ),
            ),
        )

        val event = dto.toEventOrNull()
        val detail = event?.divisionDetails?.firstOrNull()
        val updateDetail = event?.toUpdateDto()?.divisionDetails?.firstOrNull()

        assertEquals(2, detail?.gamesPerOpponent)
        assertEquals(15, detail?.restTimeMinutes)
        assertEquals(true, detail?.usesSets)
        assertEquals(3, detail?.setsPerMatch)
        assertEquals(listOf(25, 25, 15), detail?.pointsToVictory)
        assertEquals(true, detail?.playoffConfig?.doubleElimination)
        assertEquals(3, detail?.playoffConfig?.winnerSetCount)
        assertEquals(10, detail?.playoffConfig?.restTimeMinutes)
        assertEquals(2, updateDetail?.gamesPerOpponent)
        assertEquals(15, updateDetail?.restTimeMinutes)
        assertEquals(true, updateDetail?.usesSets)
        assertEquals(3, updateDetail?.setsPerMatch)
        assertEquals(listOf(25, 25, 15), updateDetail?.pointsToVictory)
        assertEquals(true, updateDetail?.playoffConfig?.doubleElimination)
        assertEquals(3, updateDetail?.playoffConfig?.winnerSetCount)
        assertEquals(10, updateDetail?.playoffConfig?.restTimeMinutes)
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
    fun event_api_dto_maps_team_official_swap_setting() {
        val dto = EventApiDto(
            id = "event-20",
            name = "API Event",
            hostId = "host-20",
            doTeamsOfficiate = true,
            teamOfficialsMaySwap = true,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
        )

        val event = dto.toEventOrNull()

        assertEquals(true, event?.doTeamsOfficiate)
        assertEquals(true, event?.teamOfficialsMaySwap)
    }

    @Test
    fun event_api_dto_maps_split_league_playoff_division_setting() {
        val dto = EventApiDto(
            id = "event-20-split",
            name = "API Event",
            hostId = "host-20",
            eventType = "LEAGUE",
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
        )

        val event = dto.toEventOrNull()

        assertEquals(true, event?.splitLeaguePlayoffDivisions)
        assertEquals(true, event?.toEventDTO()?.splitLeaguePlayoffDivisions)
        assertEquals(true, event?.toUpdateDto()?.splitLeaguePlayoffDivisions)
    }

    @Test
    fun to_update_dto_includes_official_staffing_fields() {
        val event = Event(
            id = "event-21",
            name = "Staffed Event",
            hostId = "host-21",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            officialSchedulingMode = OfficialSchedulingMode.SCHEDULE,
            officialPositions = listOf(
                EventOfficialPosition(
                    id = "position-1",
                    name = "R1",
                    count = 1,
                    order = 0,
                ),
            ),
            eventOfficials = listOf(
                EventOfficial(
                    id = "event-official-1",
                    userId = "official-1",
                    positionIds = listOf("position-1"),
                    fieldIds = listOf("field-1"),
                ),
            ),
            officialIds = listOf("official-1"),
        )

        val dto = event.toUpdateDto()

        assertEquals("SCHEDULE", dto.officialSchedulingMode)
        assertEquals(listOf("R1"), dto.officialPositions?.map(EventOfficialPosition::name))
        assertEquals(listOf("official-1"), dto.eventOfficials?.map(EventOfficial::userId))
        assertEquals(null, dto.officialIds)
    }

    @Test
    fun event_api_dto_maps_official_staffing_fields() {
        val dto = EventApiDto(
            id = "event-22",
            name = "API Event",
            hostId = "host-22",
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            officialSchedulingMode = "OFF",
            officialPositions = listOf(
                EventOfficialPosition(
                    id = "position-1",
                    name = "Line Judge",
                    count = 2,
                    order = 0,
                ),
            ),
            eventOfficials = listOf(
                EventOfficial(
                    id = "event-official-1",
                    userId = "official-1",
                    positionIds = listOf("position-1"),
                    fieldIds = listOf("field-1"),
                ),
            ),
            officialIds = listOf("official-1"),
        )

        val event = dto.toEventOrNull()

        assertEquals(OfficialSchedulingMode.OFF, event?.officialSchedulingMode)
        assertEquals(listOf("Line Judge"), event?.officialPositions?.map(EventOfficialPosition::name))
        assertEquals(listOf("official-1"), event?.eventOfficials?.map(EventOfficial::userId))
        assertEquals(listOf("official-1"), event?.officialIds)
    }

    @Test
    fun event_api_dto_maps_team_staffing_and_enables_team_officials() {
        val dto = EventApiDto(
            id = "event-team-staffing",
            name = "API Event",
            hostId = "host-team-staffing",
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            officialSchedulingMode = "TEAM_STAFFING",
            doTeamsOfficiate = false,
            teamOfficialsMaySwap = true,
        )

        val event = dto.toEventOrNull()

        assertEquals(OfficialSchedulingMode.TEAM_STAFFING, event?.officialSchedulingMode)
        assertEquals(true, event?.doTeamsOfficiate)
        assertEquals(true, event?.teamOfficialsMaySwap)
    }

    @Test
    fun to_update_dto_forces_team_officials_for_team_staffing() {
        val event = Event(
            id = "event-team-staffing-update",
            name = "Team Staffing Event",
            hostId = "host-team-staffing-update",
            start = Instant.fromEpochMilliseconds(1_700_000_000_000),
            end = Instant.fromEpochMilliseconds(1_700_003_600_000),
            officialSchedulingMode = OfficialSchedulingMode.TEAM_STAFFING,
            doTeamsOfficiate = false,
            teamOfficialsMaySwap = true,
        )

        val dto = event.toUpdateDto()

        assertEquals("TEAM_STAFFING", dto.officialSchedulingMode)
        assertEquals(true, dto.doTeamsOfficiate)
        assertEquals(true, dto.teamOfficialsMaySwap)
    }

    @Test
    fun event_api_dto_defaults_official_scheduling_mode_to_schedule_when_missing() {
        val dto = EventApiDto(
            id = "event-23",
            name = "API Event",
            hostId = "host-23",
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
        )

        val event = dto.toEventOrNull()

        assertEquals(OfficialSchedulingMode.SCHEDULE, event?.officialSchedulingMode)
    }

    @Test
    fun event_api_dto_preserves_missing_multi_division_playoff_count_until_explicitly_set() {
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

        assertEquals(10, event?.playoffTeamCount)
        assertEquals(null, event?.divisionDetails?.firstOrNull()?.playoffTeamCount)
    }

    @Test
    fun event_api_dto_does_not_add_playoff_details_to_event_divisions() {
        val leagueDivisionId = "event-25__division__m_skill_open_age_18plus"
        val playoffDivisionId = "event-25__division__playoff_1"
        val dto = EventApiDto(
            id = "event-25",
            name = "Split League",
            hostId = "host-25",
            eventType = EventType.LEAGUE.name,
            includePlayoffs = true,
            singleDivision = false,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T01:00:00Z",
            divisions = listOf(leagueDivisionId),
            divisionDetails = listOf(
                DivisionDetail(
                    id = leagueDivisionId,
                    key = "m_skill_open_age_18plus",
                    name = "Mens Open 18+",
                    divisionTypeId = "skill_open_age_18plus",
                    maxParticipants = 8,
                ),
                DivisionDetail(
                    id = playoffDivisionId,
                    key = "playoff_1",
                    name = "Upper Division",
                    kind = "PLAYOFF",
                    maxParticipants = 8,
                ),
            ),
        )

        val event = dto.toEventOrNull()

        assertEquals(listOf(leagueDivisionId), event?.divisions)
        assertEquals(
            listOf(leagueDivisionId, playoffDivisionId),
            event?.divisionDetails?.map { detail -> detail.id },
        )
    }

    @Test
    fun event_api_dto_does_not_infer_no_fixed_end_datetime_from_matching_start_and_end() {
        val dto = EventApiDto(
            id = "event-24",
            name = "Legacy-looking League",
            hostId = "host-24",
            eventType = EventType.LEAGUE.name,
            start = "2026-02-10T00:00:00Z",
            end = "2026-02-10T00:00:00Z",
        )

        val event = dto.toEventOrNull()

        assertFalse(event?.noFixedEndDateTime ?: true)
    }
}
