package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.DivisionPhaseSettingsMVP
import com.razumly.mvp.core.data.dataTypes.EventOfficial
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_CASH_APP
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_PAYPAL
import com.razumly.mvp.core.data.dataTypes.MANUAL_PAYMENT_PROVIDER_VENMO
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_MANUAL
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.evergreenDateDisplayLabel
import com.razumly.mvp.core.data.dataTypes.resolvedDivisionPriceCents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class EventDtosTest {
    @Test
    fun event_page_conversion_reports_the_malformed_row_instead_of_dropping_it() {
        val failure = assertFailsWith<IllegalArgumentException> {
            listOf(
                EventApiDto(
                    id = "event-valid",
                    name = "Valid Event",
                    hostId = "host-1",
                    start = "2026-07-13T12:00:00Z",
                    end = "2026-07-13T13:00:00Z",
                ),
                EventApiDto(
                    id = "event-bad",
                    name = "Malformed Event",
                    hostId = "host-1",
                    start = "not-a-date",
                    end = "2026-07-13T13:00:00Z",
                ),
            ).toEventsOrThrow("Hosted events page")
        }

        assertTrue(failure.message.orEmpty().contains("Hosted events page row 2"))
        assertTrue(failure.message.orEmpty().contains("id=event-bad"))
        assertTrue(failure.message.orEmpty().contains("start is invalid"))
    }

    @Test
    fun event_page_continuation_refuses_to_turn_incomplete_metadata_into_a_terminal_page() {
        val response = EventsResponseDto(
            events = listOf(
                EventApiDto(id = "event-201"),
            ),
            pagination = EventsPaginationDto(
                offset = 200,
                hasMore = true,
                nextOffset = null,
            ),
        )

        val failure = assertFailsWith<IllegalStateException> {
            response.pageContinuationOrThrow("Hosted events page", requestedOffset = 200)
        }

        assertEquals(
            "Hosted events page is missing a valid continuation offset",
            failure.message,
        )
    }

    @Test
    fun event_search_pagination_uses_server_or_raw_page_size_not_rendered_count() {
        val fullRawPage = EventsResponseDto(
            events = listOf(EventApiDto(id = "visible"), EventApiDto(id = "hidden")),
        )
        val explicitTerminalPage = fullRawPage.copy(
            pagination = EventsPaginationDto(hasMore = false),
        )

        assertTrue(fullRawPage.hasMoreEventRows(requestedLimit = 2))
        assertFalse(explicitTerminalPage.hasMoreEventRows(requestedLimit = 2))
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
    fun event_api_dto_recovers_division_ids_from_relational_details_when_projection_is_empty() {
        val divisionId = "event-relational__division__c_skill_open_age_adult"
        val event = EventApiDto(
            id = "event-relational",
            name = "Relational Tournament",
            hostId = "host-1",
            eventType = EventType.TOURNAMENT.name,
            start = "2026-06-01T08:00:00Z",
            end = "2026-06-01T09:00:00Z",
            singleDivision = false,
            divisions = emptyList(),
            divisionDetails = listOf(
                DivisionDetail(
                    id = divisionId,
                    key = "c_skill_open_age_adult",
                    name = "Coed Open Adult",
                    divisionTypeId = "skill_open_age_adult",
                    gender = "C",
                    ratingType = "SKILL",
                    maxParticipants = 8,
                ),
            ),
        ).toEventOrNull()

        assertNotNull(event)
        assertEquals(listOf(divisionId), event.divisions)
        assertEquals(listOf(divisionId), event.divisionDetails.map(DivisionDetail::id))
    }


    @Test
    fun event_sport_ids_round_trip_without_a_scalar_sport() {
        val event = EventApiDto(
            id = "multi-sport-event",
            name = "Multi Sport Event",
            hostId = "host-1",
            eventType = "EVENT",
            sportIds = listOf(" volleyball ", "soccer", "volleyball"),
            start = "2026-08-05T10:00:00Z",
            end = "2026-08-05T11:00:00Z",
        ).toEventOrNull()

        assertNotNull(event)
        assertEquals(listOf("volleyball", "soccer"), event.sportIds)
    }




    @Test
    fun event_api_dto_hydrates_tags_with_event_type_lock() {
        val event = EventApiDto(
            id = "event-tags-1",
            name = "Tournament Event",
            hostId = "host-2",
            eventType = "TOURNAMENT",
            start = "2026-06-01T08:00:00Z",
            end = "2026-06-01T09:00:00Z",
            tags = listOf(
                EventTag(id = "tag-pickup", name = "Pickup", slug = "pickup"),
                EventTag(id = "tag-league", name = "League", slug = "league"),
            ),
        ).toEventOrNull()

        assertNotNull(event)
        assertEquals(listOf("Pickup", "Tournament"), event.tags.map(EventTag::name))
        assertEquals(listOf("pickup", "tournament"), event.tags.map(EventTag::slug))
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

        assertEquals(2, detail?.gamesPerOpponent)
        assertEquals(15, detail?.restTimeMinutes)
        assertEquals(true, detail?.usesSets)
        assertEquals(3, detail?.setsPerMatch)
        assertEquals(listOf(25, 25, 15), detail?.pointsToVictory)
        assertEquals(true, detail?.playoffConfig?.doubleElimination)
        assertEquals(3, detail?.playoffConfig?.winnerSetCount)
        assertEquals(10, detail?.playoffConfig?.restTimeMinutes)
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

    @Test
    fun event_api_dto_allows_hostless_affiliate_events() {
        val dto = EventApiDto(
            id = "event-affiliate-1",
            name = "Partner League",
            hostId = null,
            organizationId = "org_partner",
            affiliateUrl = " https://partner.example.com/register ",
            eventType = EventType.LEAGUE.name,
            start = "2026-07-10T01:00:00Z",
            end = "2026-08-10T01:00:00Z",
        )

        val event = dto.toEventOrNull()

        assertNotNull(event)
        assertEquals("", event.hostId)
        assertEquals("org_partner", event.organizationId)
        assertEquals("https://partner.example.com/register", event.affiliateUrl)
        assertEquals(EventType.LEAGUE, event.eventType)
    }

    @Test
    fun event_api_dto_preserves_evergreen_date_display_fields() {
        val dto = EventApiDto(
            id = "event-affiliate-evergreen-1",
            name = "Partner Program",
            hostId = null,
            organizationId = "org_partner",
            affiliateUrl = "https://partner.example.com/register",
            eventType = EventType.LEAGUE.name,
            start = "2099-01-01T00:00:00Z",
            end = "2099-01-01T00:00:00Z",
            scheduleText = "Call for availability",
            dateDisplayMode = " NO_FIXED_DATE ",
            dateDisplayText = "Ongoing registration",
        )

        val event = dto.toEventOrNull()

        assertNotNull(event)
        assertEquals("Call for availability", event.scheduleText)
        assertEquals("NO_FIXED_DATE", event.dateDisplayMode)
        assertEquals("Ongoing registration", event.dateDisplayText)
        assertEquals("Ongoing registration", event.evergreenDateDisplayLabel())
    }

    @Test
    fun event_api_dto_maps_manual_registration_payment_fields() {
        val dto = EventApiDto(
            id = "event-manual-1",
            name = "Manual Payment Tournament",
            hostId = "host-manual",
            eventType = EventType.TOURNAMENT.name,
            start = "2026-07-10T01:00:00Z",
            end = "2026-07-11T01:00:00Z",
            registrationPaymentMode = "manual",
            manualPaymentLinks = listOf(
                ManualPaymentLink(
                    id = "venmo",
                    provider = "venmo",
                    label = "Venmo",
                    url = "@bracketiq",
                ),
                ManualPaymentLink(
                    id = "cash",
                    provider = "cashapp",
                    label = "Cash App",
                    url = "\$bracketiq",
                ),
                ManualPaymentLink(
                    id = "paypal",
                    provider = "paypal",
                    label = "PayPal",
                    url = "bracketiq",
                ),
                ManualPaymentLink(
                    id = "bad",
                    provider = "paypal",
                    label = "Bad",
                    url = "http://not-secure.example.com",
                ),
            ),
            manualPaymentInstructions = " Send a screenshot after paying. ",
        )

        val event = dto.toEventOrNull()

        assertNotNull(event)
        assertEquals(REGISTRATION_PAYMENT_MODE_MANUAL, event.registrationPaymentMode)
        assertEquals("Send a screenshot after paying.", event.manualPaymentInstructions)
        assertEquals(3, event.manualPaymentLinks.size)
        assertEquals(MANUAL_PAYMENT_PROVIDER_VENMO, event.manualPaymentLinks[0].provider)
        assertEquals("https://venmo.com/u/bracketiq", event.manualPaymentLinks[0].url)
        assertEquals(MANUAL_PAYMENT_PROVIDER_CASH_APP, event.manualPaymentLinks[1].provider)
        assertEquals("https://cash.app/\$bracketiq", event.manualPaymentLinks[1].url)
        assertEquals(MANUAL_PAYMENT_PROVIDER_PAYPAL, event.manualPaymentLinks[2].provider)
        assertEquals("https://paypal.me/bracketiq", event.manualPaymentLinks[2].url)
    }
}
