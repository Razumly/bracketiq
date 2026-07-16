package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_MANUAL
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.buildEventDivisionId
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailsValidationTest {

    @Test
    fun online_event_edits_require_a_confirmed_price_quote() {
        assertFalse(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = false,
                isQuoteConfirmed = false,
            ),
        )
        assertTrue(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = false,
                isQuoteConfirmed = true,
            ),
        )
    }

    @Test
    fun manual_payment_and_read_only_event_prices_do_not_require_quotes() {
        assertTrue(
            isEventInclusivePriceReady(
                editView = true,
                manualPaymentsEnabled = true,
                isQuoteConfirmed = false,
            ),
        )
        assertTrue(
            isEventInclusivePriceReady(
                editView = false,
                manualPaymentsEnabled = false,
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
                maxParticipants = 4,
                playoffTeamCount = 2,
                playoffPlacementDivisionIds = listOf(bracketDivisionId, bracketDivisionId),
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
            playoffTeamCount = 8,
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
