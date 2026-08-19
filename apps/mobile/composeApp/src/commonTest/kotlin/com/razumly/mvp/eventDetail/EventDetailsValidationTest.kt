package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.MIN_BRACKET_TEAM_COUNT
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_MANUAL
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.withDefaultPlayoffTeamCounts
import com.razumly.mvp.core.data.util.buildEventDivisionId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailsValidationTest {

    @Test
    fun weekly_events_require_a_repeating_timeslot_and_resource_count() {
        val event = baseLeagueEvent(maxParticipants = 2).copy(
            eventType = EventType.WEEKLY_EVENT,
            noFixedEndDateTime = false,
        )
        val oneTimeSlot = TimeSlot(
            id = "slot-once",
            repeating = false,
            dayOfWeek = null,
            startTimeMinutes = null,
            endTimeMinutes = null,
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            startDate = event.start,
            endDate = event.end,
            price = null,
        )

        val result = computeEventValidationResult(
            editEvent = event,
            isNewEvent = true,
            fieldCount = 0,
            leagueTimeSlots = listOf(oneTimeSlot),
            leagueSlotErrors = emptyMap(),
            slotEditorEnabled = true,
            divisionDetailsForSettings = emptyList(),
            isColorLoaded = true,
            scheduleTimeLocked = false,
            requiresPositiveRegistrationPrice = false,
        )

        assertFalse(result.isFieldCountValid)
        assertFalse(result.isLeagueSlotsValid)
        assertTrue("Add at least one weekly repeating timeslot." in result.validationErrors)
    }

    @Test
    fun online_event_edits_require_a_confirmed_price_quote_when_registration_is_paid() {
        assertFalse(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = false,
                activePriceCents = 5_000,
                isQuoteConfirmed = false,
            ),
        )
        assertTrue(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = false,
                activePriceCents = 5_000,
                isQuoteConfirmed = true,
            ),
        )
    }

    @Test
    fun free_online_event_edits_do_not_require_a_price_quote() {
        assertTrue(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = false,
                activePriceCents = 0,
                isQuoteConfirmed = false,
            ),
        )
    }

    @Test
    fun multi_division_edits_require_a_quote_only_for_the_active_paid_division() {
        val persistedPaidDivisionPriceCents = 5_000

        assertTrue(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = false,
                activePriceCents = 0,
                isQuoteConfirmed = false,
            ),
        )
        assertFalse(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = false,
                activePriceCents = persistedPaidDivisionPriceCents,
                isQuoteConfirmed = false,
            ),
        )
    }

    @Test
    fun not_ready_multi_division_editor_ignores_positive_event_price_fallback() {
        val activePriceCents = activeInclusivePriceCents(
            singleDivision = false,
            eventPriceCents = 5_000,
            divisionEditorReady = false,
            divisionPriceCents = 5_000,
        )

        assertEquals(0, activePriceCents)
        assertTrue(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = false,
                activePriceCents = activePriceCents,
                isQuoteConfirmed = false,
            ),
        )
    }

    @Test
    fun manual_payment_and_read_only_event_prices_do_not_require_quotes() {
        assertTrue(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = true,
                activePriceCents = 5_000,
                isQuoteConfirmed = false,
            ),
        )
        assertTrue(
            isEventInclusivePriceReady(
                editView = false,
                manualPaymentsEnabled = false,
                activePriceCents = 5_000,
                isQuoteConfirmed = false,
            ),
        )
    }

    @Test
    fun given_blank_event_name_when_otherwise_valid_then_validation_fails() {
        val result = validateEvent(baseLeagueEvent(maxParticipants = 2).copy(name = "   "))

        assertFalse(result.isNameValid)
        assertFalse(result.isValid)
        assertTrue("Event name is required." in result.validationErrors)
    }

    @Test
    fun given_no_event_image_when_image_loader_is_ready_then_validation_still_fails() {
        val result = validateEvent(baseLeagueEvent(maxParticipants = 2).copy(imageId = ""))

        assertFalse(result.isImageValid)
        assertFalse(result.isValid)
        assertTrue("Select an image for the event." in result.validationErrors)
    }

    @Test
    fun given_minimum_age_above_maximum_age_then_both_fields_report_the_range() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(minAge = 18, maxAge = 12),
        )

        assertFalse(result.isAgeRangeValid)
        assertFalse(result.isValid)
        assertTrue(result.validationErrors.any { error -> error.contains("Minimum age") })
        assertTrue(result.validationErrors.any { error -> error.contains("Maximum age") })
    }

    @Test
    fun given_manual_payments_with_a_provider_username_then_validation_passes() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(
                registrationPaymentMode = REGISTRATION_PAYMENT_MODE_MANUAL,
                manualPaymentLinks = listOf(
                    ManualPaymentLink(
                        id = "payment-1",
                        provider = "CASH_APP",
                        label = "Cash App",
                        url = "camka14",
                    ),
                ),
            ),
        )

        assertTrue(result.isManualPaymentLinksValid)
        assertTrue(result.validationErrors.none { error -> error.contains("payment", ignoreCase = true) })
    }

    @Test
    fun given_manual_payments_with_an_invalid_https_link_then_validation_fails() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(
                registrationPaymentMode = REGISTRATION_PAYMENT_MODE_MANUAL,
                manualPaymentLinks = listOf(
                    ManualPaymentLink(
                        id = "payment-1",
                        provider = "STRIPE",
                        label = "Stripe",
                        url = "not-a-url",
                    ),
                ),
            ),
        )

        assertFalse(result.isManualPaymentLinksValid)
        assertFalse(result.isValid)
        assertTrue(result.validationErrors.any { error -> error.contains("valid https") })
    }

    @Test
    fun given_an_incomplete_official_position_then_validation_fails() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(
                officialPositions = listOf(
                    EventOfficialPosition(id = "position-1", name = "", count = 0, order = 0),
                ),
            ),
        )

        assertFalse(result.isOfficialPositionsValid)
        assertFalse(result.isValid)
        assertTrue(result.validationErrors.any { error -> error.contains("official position") })
    }

    @Test
    fun given_single_division_team_event_when_max_teams_blank_then_validation_fails() {
        val result = validateEvent(baseLeagueEvent(maxParticipants = 0))

        assertFalse(result.isMaxParticipantsValid)
        assertFalse(result.isValid)
        assertTrue("Max teams must be at least 2." in result.validationErrors)
    }

    @Test
    fun given_single_division_team_event_when_max_teams_set_then_validation_passes() {
        val result = validateEvent(baseLeagueEvent(maxParticipants = 2))

        assertTrue(result.isMaxParticipantsValid)
        assertTrue(result.isValid)
        assertFalse(result.validationErrors.any { error -> error.contains("Max teams") })
    }

    @Test
    fun given_tournament_when_max_teams_is_two_then_validation_fails() {
        val detail = singleDivisionTournamentPoolDetail(poolCount = null).copy(
            maxParticipants = 2,
            playoffTeamCount = null,
        )
        val result = validateEvent(
            singleDivisionTournamentEvent(detail).copy(
                includePlayoffs = false,
                maxParticipants = 2,
            ),
            divisionDetailsForSettings = listOf(detail),
        )

        assertFalse(result.isMaxParticipantsValid)
        assertFalse(result.isValid)
        assertTrue("Max teams must be at least 3." in result.validationErrors)
    }

    @Test
    fun given_multi_division_tournament_when_event_max_teams_is_two_then_validation_fails() {
        val open = singleDivisionTournamentPoolDetail(poolCount = null).copy(
            id = "event-multi__division__open",
            maxParticipants = 3,
            playoffTeamCount = null,
        )
        val advanced = open.copy(id = "event-multi__division__advanced")
        val event = singleDivisionTournamentEvent(open).copy(
            includePlayoffs = false,
            singleDivision = false,
            divisions = listOf(open.id, advanced.id),
            divisionDetails = listOf(open, advanced),
            maxParticipants = 2,
        )

        val result = validateEvent(
            event,
            divisionDetailsForSettings = listOf(open, advanced),
        )

        assertFalse(result.isMaxParticipantsValid)
        assertFalse(result.isValid)
        assertTrue("Max teams must be at least 3." in result.validationErrors)
    }

    @Test
    fun given_multi_division_league_when_event_playoff_count_is_two_then_validation_fails() {
        val open = splitLeagueDivision(
            id = "event-multi__division__open",
            name = "Open",
            skillDivisionTypeId = "open",
            playoffDivisionId = null,
        )
        val advanced = open.copy(
            id = "event-multi__division__advanced",
            name = "Advanced",
            skillDivisionTypeId = "advanced",
        )
        val event = baseLeagueEvent(maxParticipants = 8).copy(
            includePlayoffs = true,
            singleDivision = false,
            playoffTeamCount = 2,
            divisions = listOf(open.id, advanced.id),
            divisionDetails = listOf(open, advanced),
        )

        val result = validateEvent(
            event,
            divisionDetailsForSettings = listOf(open, advanced),
        )

        assertFalse(result.isLeaguePlayoffTeamsValid)
        assertFalse(result.isValid)
        assertTrue(
            result.validationErrors.any { error ->
                error.contains("playoff team count", ignoreCase = true)
            },
        )
    }

    @Test
    fun individual_registration_does_not_require_a_team_size() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(
                eventType = EventType.EVENT,
                teamSignup = false,
                teamSizeLimit = 0,
            ),
        )

        assertTrue(result.isTeamSizeValid)
        assertFalse(result.validationErrors.any { error -> error.contains("Team size") })
    }

    @Test
    fun simple_paid_registration_requires_a_positive_price() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(priceCents = 0),
            requiresPositiveRegistrationPrice = true,
        )

        assertFalse(result.isPriceValid)
        assertTrue(
            result.validationErrors.any { error ->
                error == "Enter a price greater than 0 for paid registration."
            },
        )
    }

    @Test
    fun given_split_division_team_event_when_division_max_teams_missing_then_validation_fails() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 0).copy(
                singleDivision = false,
                divisions = listOf("open"),
            ),
            divisionDetailsForSettings = listOf(DivisionDetail(id = "open", maxParticipants = null)),
        )

        assertFalse(result.isMaxParticipantsValid)
        assertFalse(result.isValid)
        assertTrue("Each division must have max teams of at least 2." in result.validationErrors)
    }

    @Test
    fun given_split_division_team_event_when_divisions_have_same_identity_then_validation_fails() {
        val firstId = buildEventDivisionId("event-1", "m_skill_open_age_u18")
        val secondId = buildEventDivisionId("event-1_2", "m_skill_open_age_u18")
        val first = DivisionDetail(
            id = firstId,
            key = "m_skill_open_age_u18",
            name = "Men's Open U18",
            gender = "M",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "u18",
            maxParticipants = 8,
        )
        val second = DivisionDetail(
            id = secondId,
            key = "m_skill_open_age_u18",
            name = "Renamed U18",
            gender = "M",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "u18",
            maxParticipants = 8,
        )

        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 0).copy(
                id = "event-1",
                singleDivision = false,
                divisions = listOf(firstId, secondId),
                divisionDetails = listOf(first, second),
            ),
            divisionDetailsForSettings = listOf(first, second),
        )

        assertFalse(result.isDivisionIdentityValid)
        assertFalse(result.isValid)
        assertTrue(
            "Each division must have a unique gender, skill division, and age division." in result.validationErrors,
        )
    }

    @Test
    fun given_divisions_with_different_identities_and_the_same_name_then_validation_fails() {
        val first = DivisionDetail(
            id = "event-1__division__open",
            name = "Open",
            gender = "C",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "adult",
            maxParticipants = 8,
            playoffPlacementDivisionIds = listOf("event-1__division__playoff"),
        )
        val second = DivisionDetail(
            id = "event-1__division__advanced",
            name = "  open  ",
            gender = "C",
            skillDivisionTypeId = "advanced",
            kind = "PLAYOFF",
            ageDivisionTypeId = "adult",
            maxParticipants = 8,
        )

        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 0).copy(
                id = "event-1",
                singleDivision = false,
                divisions = listOf(first.id, second.id),
                divisionDetails = listOf(first, second),
            ),
            divisionDetailsForSettings = listOf(first, second),
        )

        assertFalse(result.isDivisionNameValid)
        assertFalse(result.isValid)
        assertTrue(
            "Division name must be unique within this event. Choose a different name." in result.validationErrors,
        )
    }

    @Test
    fun given_a_generated_phase_with_its_source_name_then_name_validation_succeeds() {
        val source = DivisionDetail(
            id = "event-1__division__open",
            name = "Open",
            gender = "C",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "adult",
            maxParticipants = 8,
        )
        val generatedPhase = source.copy(
            id = "${source.id}__phase__playoff",
            sourceDivisionId = source.id,
            isSystemGenerated = true,
            kind = "PLAYOFF",
        )

        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 0).copy(
                id = "event-1",
                singleDivision = false,
                divisions = listOf(source.id),
                divisionDetails = listOf(source, generatedPhase),
            ),
            divisionDetailsForSettings = listOf(source),
        )

        assertTrue(result.isDivisionNameValid)
    }

    @Test
    fun given_league_playoffs_when_team_count_is_two_then_validation_fails() {
        val detail = splitLeagueDivision(
            id = "event-1__division__open",
            name = "Open",
            skillDivisionTypeId = "open",
            playoffDivisionId = null,
        )
        val event = baseLeagueEvent(maxParticipants = 8).copy(
            id = "event-1",
            includePlayoffs = true,
            playoffTeamCount = 2,
            divisions = listOf(detail.id),
            divisionDetails = listOf(detail),
        )

        val result = validateEvent(
            event,
            divisionDetailsForSettings = listOf(detail),
        )

        assertFalse(result.isLeaguePlayoffTeamsValid)
        assertFalse(result.isValid)
        assertTrue("Playoff team count must be at least 3 when playoffs are enabled." in result.validationErrors)
    }

    @Test
    fun given_split_league_playoffs_when_mapping_does_not_fill_target_then_validation_fails() {
        val playoffDivisionId = "event-1__division__playoff_gold"
        val openDivision = splitLeagueDivision(
            id = "event-1__division__open",
            name = "Open",
            skillDivisionTypeId = "open",
            playoffDivisionId = playoffDivisionId,
        )
        val recDivision = splitLeagueDivision(
            id = "event-1__division__rec",
            name = "Rec",
            skillDivisionTypeId = "rec",
            playoffDivisionId = null,
        )
        val playoffDivision = DivisionDetail(
            id = playoffDivisionId,
            kind = "PLAYOFF",
            name = "Gold",
            maxParticipants = 4,
        )
        val event = baseLeagueEvent(maxParticipants = 0).copy(
            id = "event-1",
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            singleDivision = true,
            divisions = listOf(openDivision.id, recDivision.id),
            divisionDetails = listOf(openDivision, recDivision, playoffDivision),
        )

        val result = validateEvent(
            event,
            divisionDetailsForSettings = listOf(openDivision, recDivision),
        )

        assertFalse(result.isLeaguePlayoffTeamsValid)
        assertFalse(result.isValid)
        assertTrue(
            "Playoff division \"Gold\" has 3 assigned positions and 4 team slots. " +
                "Assign every playoff position to an existing playoff division." in result.validationErrors,
        )
    }

    @Test
    fun given_split_league_playoffs_when_target_count_is_below_three_then_validation_fails() {
        val goldDivisionId = "event-1__division__playoff_gold"
        val silverDivisionId = "event-1__division__playoff_silver"
        val sourceDivision = splitLeagueDivision(
            id = "event-1__division__open",
            name = "Open",
            skillDivisionTypeId = "open",
            playoffDivisionId = null,
        ).copy(
            playoffPlacementDivisionIds = listOf(goldDivisionId, goldDivisionId, silverDivisionId),
        )
        val playoffDivisions = listOf(
            DivisionDetail(
                id = goldDivisionId,
                kind = "PLAYOFF",
                name = "Gold",
                maxParticipants = 2,
            ),
            DivisionDetail(
                id = silverDivisionId,
                kind = "PLAYOFF",
                name = "Silver",
                maxParticipants = 1,
            ),
        )
        val event = baseLeagueEvent(maxParticipants = 8).copy(
            id = "event-1",
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            singleDivision = true,
            divisions = listOf(sourceDivision.id),
            divisionDetails = listOf(sourceDivision) + playoffDivisions,
        )

        val result = validateEvent(
            event,
            divisionDetailsForSettings = listOf(sourceDivision),
        )

        assertFalse(result.isLeaguePlayoffTeamsValid)
        assertFalse(result.isValid)
        assertTrue(
            "Playoff division \"Gold\" team count must be at least 3." in result.validationErrors,
        )
    }

    @Test
    fun given_split_league_playoffs_when_source_count_is_missing_then_event_count_does_not_validate() {
        val playoffDivisionId = "event-1__division__playoff_gold"
        val openDivision = splitLeagueDivision(
            id = "event-1__division__open",
            name = "Open",
            skillDivisionTypeId = "open",
            playoffDivisionId = playoffDivisionId,
        ).copy(playoffTeamCount = null)
        val recDivision = splitLeagueDivision(
            id = "event-1__division__rec",
            name = "Rec",
            skillDivisionTypeId = "rec",
            playoffDivisionId = playoffDivisionId,
        )
        val playoffDivision = DivisionDetail(
            id = playoffDivisionId,
            kind = "PLAYOFF",
            name = "Gold",
            maxParticipants = 4,
        )
        val event = baseLeagueEvent(maxParticipants = 0).copy(
            id = "event-1",
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            singleDivision = true,
            playoffTeamCount = 4,
            divisions = listOf(openDivision.id, recDivision.id),
            divisionDetails = listOf(openDivision, recDivision, playoffDivision),
        )

        val result = validateEvent(
            event,
            divisionDetailsForSettings = listOf(
                openDivision.copy(playoffTeamCount = 4),
                recDivision.copy(playoffTeamCount = 4),
            ),
        )

        assertFalse(result.isLeaguePlayoffTeamsValid)
        assertTrue(
            "Each division must have a playoff team count of at least 3 when playoffs are enabled." in
                result.validationErrors,
        )
        assertFalse(result.validationErrors.any { error -> error.contains("mapped positions") })
    }

    @Test
    fun given_split_single_division_league_when_editor_resolves_count_then_explicit_or_default_value_is_used() {
        val event = baseLeagueEvent(maxParticipants = 8).copy(
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            singleDivision = true,
            playoffTeamCount = 4,
        )

        assertEquals(2, event.resolveDivisionPlayoffTeamCount(2))
        assertEquals(4, event.resolveDivisionPlayoffTeamCount(null))
        assertEquals(
            4,
            event.copy(splitLeaguePlayoffDivisions = false).resolveDivisionPlayoffTeamCount(2),
        )
        assertEquals(
            MIN_BRACKET_TEAM_COUNT,
            event.copy(playoffTeamCount = null).resolveDivisionPlayoffTeamCount(null),
        )
    }

    @Test
    fun given_enabled_missing_counts_when_the_draft_is_normalized_then_three_is_used_and_explicit_values_remain() {
        val openDivision = splitLeagueDivision(
            id = "event-1__division__open",
            name = "Open",
            skillDivisionTypeId = "open",
            playoffDivisionId = "event-1__division__playoff_gold",
        ).copy(playoffTeamCount = null)
        val recDivision = splitLeagueDivision(
            id = "event-1__division__rec",
            name = "Rec",
            skillDivisionTypeId = "rec",
            playoffDivisionId = "event-1__division__playoff_gold",
        ).copy(playoffTeamCount = 5)
        val playoffDivision = DivisionDetail(
            id = "event-1__division__playoff_gold",
            kind = "PLAYOFF",
            name = "Gold",
            maxParticipants = null,
        )

        val normalized = baseLeagueEvent(maxParticipants = 8).copy(
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            singleDivision = false,
            playoffTeamCount = null,
            divisions = listOf(openDivision.id, recDivision.id),
            divisionDetails = listOf(openDivision, recDivision, playoffDivision),
        ).withDefaultPlayoffTeamCounts()

        assertEquals(MIN_BRACKET_TEAM_COUNT, normalized.playoffTeamCount)
        assertEquals(
            listOf(MIN_BRACKET_TEAM_COUNT, 5),
            normalized.divisionDetails
                .filterNot { detail -> detail.kind == "PLAYOFF" }
                .map { detail -> detail.playoffTeamCount },
        )
        assertEquals(
            MIN_BRACKET_TEAM_COUNT,
            normalized.divisionDetails.first { detail -> detail.kind == "PLAYOFF" }.maxParticipants,
        )
    }

    @Test
    fun given_split_league_playoffs_when_mapping_fills_target_then_only_canonical_sources_pass() {
        val playoffDivisionId = "event-1__division__playoff_gold"
        val openDivision = splitLeagueDivision(
            id = "event-1__division__open",
            name = "Open",
            skillDivisionTypeId = "open",
            playoffDivisionId = playoffDivisionId,
        )
        val recDivision = splitLeagueDivision(
            id = "event-1__division__rec",
            name = "Rec",
            skillDivisionTypeId = "rec",
            playoffDivisionId = playoffDivisionId,
        )
        val playoffDivision = DivisionDetail(
            id = playoffDivisionId,
            kind = "PLAYOFF",
            name = "Gold",
            maxParticipants = 6,
        )
        val event = baseLeagueEvent(maxParticipants = 0).copy(
            id = "event-1",
            includePlayoffs = true,
            splitLeaguePlayoffDivisions = true,
            singleDivision = false,
            divisions = listOf(openDivision.id, recDivision.id),
            divisionDetails = listOf(openDivision, recDivision, playoffDivision),
        )

        val result = validateEvent(
            event,
            divisionDetailsForSettings = listOf(openDivision, recDivision),
        )
        val noncanonicalResult = validateEvent(
            event.copy(divisions = listOf(openDivision.key, recDivision.key)),
            divisionDetailsForSettings = listOf(openDivision, recDivision),
        )

        assertTrue(result.isLeaguePlayoffTeamsValid)
        assertTrue(result.isValid)
        assertFalse(result.validationErrors.any { error -> error.contains("mapped positions") })
        assertFalse(noncanonicalResult.isLeaguePlayoffTeamsValid)
        assertTrue(
            "One or more league divisions are not saved correctly. " +
                "Save each league division before you assign playoff positions." in
                noncanonicalResult.validationErrors,
        )
    }

    @Test
    fun given_timed_league_when_match_duration_is_one_minute_then_validation_passes_duration() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(matchDurationMinutes = 1),
        )

        assertTrue(result.isLeagueDurationValid)
        assertTrue(result.isValid)
    }

    @Test
    fun given_timed_league_when_match_duration_is_empty_then_validation_warns_for_one_minute_minimum() {
        val result = validateEvent(
            baseLeagueEvent(maxParticipants = 2).copy(matchDurationMinutes = null),
        )

        assertFalse(result.isLeagueDurationValid)
        assertFalse(result.isValid)
        assertTrue("Match duration must be at least 1 minute." in result.validationErrors)
    }

    @Test
    fun given_tournament_pool_play_when_bracket_settings_are_valid_then_validation_passes() {
        val eventId = "event-1"
        val bracketDivisionId = buildEventDivisionId(eventId, "m_skill_open_age_18plus")
        val poolDivisionIds = listOf("pool_a", "pool_b", "pool_c", "pool_d")
            .map { suffix -> "${bracketDivisionId}_$suffix" }
        val poolDetails = poolDivisionIds.map { poolDivisionId ->
            DivisionDetail(
                id = poolDivisionId,
                kind = "LEAGUE",
                name = "Pool",
                isSystemGenerated = true,
                maxParticipants = 4,
                playoffTeamCount = 3,
                playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId, bracketDivisionId),
                usesSets = true,
                setsPerMatch = 3,
                pointsToVictory = listOf(21, 21, 21),
                setDurationMinutes = 20,
            )
        }
        val bracketDetail = DivisionDetail(
            id = bracketDivisionId,
            kind = "PLAYOFF",
            name = "Mens Open 18+",
            maxParticipants = 16,
            playoffTeamCount = 12,
            poolCount = 4,
            usesSets = true,
            setsPerMatch = 3,
            pointsToVictory = listOf(21, 21, 21),
            setDurationMinutes = 20,
            playoffConfig = TournamentConfig(
                winnerSetCount = 3,
                winnerBracketPointsToVictory = listOf(21, 21, 21),
                setDurationMinutes = 20,
            ),
        )
        val event = Event(
            id = eventId,
            name = "Test Phone Tourny with pools",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            teamSignup = true,
            singleDivision = false,
            divisions = poolDivisionIds,
            divisionDetails = poolDetails + bracketDetail,
            maxParticipants = 16,
            teamSizeLimit = 2,
            location = "Lacamas Park",
            coordinates = listOf(-122.0, 37.0),
            imageId = "image-1",
            usesSets = true,
            winnerSetCount = 1,
            winnerBracketPointsToVictory = listOf(21),
            setDurationMinutes = 20,
        )

        val result = validateEvent(
            event,
            divisionDetailsForSettings = listOf(bracketDetail),
        )

        assertTrue(result.isLeaguePlayoffTeamsValid)
        assertTrue(result.isValid)
    }

    @Test
    fun given_single_division_tournament_pool_play_when_pool_count_is_set_then_validation_passes() {
        val detail = singleDivisionTournamentPoolDetail(poolCount = 2)
        val result = validateEvent(
            singleDivisionTournamentEvent(detail),
            divisionDetailsForSettings = listOf(detail),
        )

        assertTrue(result.isLeaguePlayoffTeamsValid)
        assertFalse(
            result.validationErrors.any { error ->
                error.contains("pool count", ignoreCase = true)
            },
        )
    }

    @Test
    fun given_single_division_tournament_pool_play_when_pool_count_is_missing_then_validation_fails() {
        val detail = singleDivisionTournamentPoolDetail(poolCount = null)
        val result = validateEvent(
            singleDivisionTournamentEvent(detail),
            divisionDetailsForSettings = listOf(detail),
        )

        assertFalse(result.isLeaguePlayoffTeamsValid)
        assertFalse(result.isValid)
        assertTrue(
            result.validationErrors.any { error ->
                error.contains("pool count", ignoreCase = true)
            },
        )
    }

    private fun singleDivisionTournamentEvent(detail: DivisionDetail): Event {
        return Event(
            id = "event-single",
            name = "Single Division Tournament",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            teamSignup = true,
            singleDivision = true,
            divisions = listOf(detail.id),
            divisionDetails = listOf(detail),
            maxParticipants = 8,
            teamSizeLimit = 2,
            location = "Main Courts",
            coordinates = listOf(-122.0, 37.0),
            imageId = "image-1",
            matchDurationMinutes = 20,
        )
    }

    private fun singleDivisionTournamentPoolDetail(poolCount: Int?): DivisionDetail {
        return DivisionDetail(
            id = "event-single__division__m_skill_open_age_u18",
            maxParticipants = 8,
            playoffTeamCount = 4,
            poolCount = poolCount,
        )
    }

    private fun splitLeagueDivision(
        id: String,
        name: String,
        skillDivisionTypeId: String,
        playoffDivisionId: String?,
    ): DivisionDetail = DivisionDetail(
        id = id,
        key = skillDivisionTypeId,
        name = name,
        gender = "C",
        skillDivisionTypeId = skillDivisionTypeId,
        ageDivisionTypeId = "adult",
        maxParticipants = 8,
        playoffTeamCount = 3,
        playoffPlacementDivisionIds = List(3) { playoffDivisionId.orEmpty() }
            .filter(String::isNotBlank),
    )

    private fun validateEvent(
        event: Event,
        divisionDetailsForSettings: List<DivisionDetail> = emptyList(),
        requiresPositiveRegistrationPrice: Boolean = false,
    ): EventValidationResult {
        return computeEventValidationResult(
            editEvent = event,
            isNewEvent = false,
            fieldCount = 0,
            leagueTimeSlots = emptyList(),
            leagueSlotErrors = emptyMap(),
            slotEditorEnabled = false,
            divisionDetailsForSettings = divisionDetailsForSettings,
            isColorLoaded = true,
            scheduleTimeLocked = true,
            requiresPositiveRegistrationPrice = requiresPositiveRegistrationPrice,
        )
    }

    private fun baseLeagueEvent(maxParticipants: Int): Event {
        return Event(
            name = "Spring League",
            eventType = EventType.LEAGUE,
            teamSignup = true,
            singleDivision = true,
            maxParticipants = maxParticipants,
            location = "Main Courts",
            coordinates = listOf(-122.0, 37.0),
            imageId = "image-1",
            matchDurationMinutes = 15,
        )
    }
}
