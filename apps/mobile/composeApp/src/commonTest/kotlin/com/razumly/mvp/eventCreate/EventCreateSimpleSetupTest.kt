package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.REGISTRATION_PAYMENT_MODE_MANUAL
import com.razumly.mvp.core.data.dataTypes.TeamCheckInMode
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.SportDTO
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.eventDetail.EventDetailsSectionVisibility
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventCreateSimpleSetupTest {

    @Test
    fun simple_setup_starts_with_options_then_uses_independent_section_copies() {
        assertEquals(
            listOf(
                "Options",
                "Basic Information",
                "Event Details",
                "Match Rules",
                "Staff",
                "Divisions",
                "League Scoring Config",
                "Schedule",
            ),
            EventCreateSetupPageId.entries.map(EventCreateSetupPageId::label),
        )
    }

    @Test
    fun standard_events_skip_only_advanced_sections_that_do_not_render() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT),
            currentPageId = EventCreateSetupPageId.BASIC_INFORMATION,
            completedPageIds = emptySet(),
        )

        assertFalse(pages.first { it.id == EventCreateSetupPageId.MATCH_RULES }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.LEAGUE_SCORING }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.EVENT_DETAILS }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.STAFF }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.DIVISIONS }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.SCHEDULE }.used)
    }

    @Test
    fun league_setup_includes_every_advanced_section() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.LEAGUE),
            currentPageId = EventCreateSetupPageId.BASIC_INFORMATION,
            completedPageIds = setOf(
                EventCreateSetupPageId.OPTIONS,
                EventCreateSetupPageId.BASIC_INFORMATION,
            ),
        )

        assertTrue(pages.all(EventCreateSetupPage::used))
        assertEquals(
            EventCreateSetupPageStatus.AVAILABLE,
            pages.first { it.id == EventCreateSetupPageId.EVENT_DETAILS }.status,
        )
    }

    @Test
    fun tournament_setup_includes_match_rules_but_not_league_scoring() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.TOURNAMENT),
            currentPageId = EventCreateSetupPageId.BASIC_INFORMATION,
            completedPageIds = emptySet(),
        )

        assertTrue(pages.first { it.id == EventCreateSetupPageId.MATCH_RULES }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.LEAGUE_SCORING }.used)
    }

    @Test
    fun navigation_skips_sections_advanced_does_not_render() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT),
            currentPageId = EventCreateSetupPageId.EVENT_DETAILS,
            completedPageIds = EventCreateSetupPageId.entries.toSet(),
        )

        assertEquals(
            EventCreateSetupPageId.STAFF,
            nextUsedSetupPage(pages, EventCreateSetupPageId.EVENT_DETAILS),
        )
        assertEquals(
            EventCreateSetupPageId.EVENT_DETAILS,
            previousUsedSetupPage(pages, EventCreateSetupPageId.STAFF),
        )
        assertNull(nextUsedSetupPage(pages, EventCreateSetupPageId.SCHEDULE))
    }

    @Test
    fun each_simple_page_exposes_only_its_advanced_section_content() {
        assertEquals(
            EventDetailsSectionVisibility.None.copy(options = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.OPTIONS),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(hero = true, basics = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.BASIC_INFORMATION),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(registration = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.EVENT_DETAILS),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(matchRules = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.MATCH_RULES),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(staff = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.STAFF),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(divisions = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.DIVISIONS),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(leagueScoring = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.LEAGUE_SCORING),
        )
        assertEquals(
            EventDetailsSectionVisibility.None.copy(schedule = true),
            simpleSetupSectionVisibility(EventCreateSetupPageId.SCHEDULE),
        )
    }

    @Test
    fun basic_division_and_schedule_pages_keep_their_minimum_continue_checks() {
        val event = Event(
            name = "Summer League",
            imageId = "image-1",
            sportId = "basketball",
            location = "Main Gym",
            coordinates = listOf(-122.6, 45.5),
            noFixedEndDateTime = true,
        )

        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.BASIC_INFORMATION, event))
        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.SCHEDULE, event))
        assertFalse(isSimpleSetupPageComplete(EventCreateSetupPageId.DIVISIONS, event))
    }

    @Test
    fun basic_information_requires_an_uploaded_event_image_before_continue() {
        val event = Event(
            name = "Summer League",
            imageId = "",
            sportId = "basketball",
            location = "Main Gym",
            coordinates = listOf(-122.6, 45.5),
            noFixedEndDateTime = true,
        )

        assertFalse(isSimpleSetupPageComplete(EventCreateSetupPageId.BASIC_INFORMATION, event))
        assertTrue(
            isSimpleSetupPageComplete(
                EventCreateSetupPageId.BASIC_INFORMATION,
                event.copy(imageId = "image-1"),
            ),
        )
    }

    @Test
    fun league_scoring_requires_each_enabled_sport_value_before_continue() {
        val sport = SportDTO(
            name = "Soccer",
            usePointsForWin = true,
            usePointsForDraw = true,
            usePointsForLoss = true,
        ).toSport(id = "soccer")
        val event = Event(eventType = EventType.LEAGUE, sportId = sport.id)

        assertFalse(
            isSimpleSetupPageComplete(
                EventCreateSetupPageId.LEAGUE_SCORING,
                event,
                leagueScoringConfig = LeagueScoringConfigDTO(pointsForWin = 3, pointsForDraw = 1),
                selectedSport = sport,
            ),
        )
        assertTrue(
            isSimpleSetupPageComplete(
                EventCreateSetupPageId.LEAGUE_SCORING,
                event,
                leagueScoringConfig = LeagueScoringConfigDTO(
                    pointsForWin = 3,
                    pointsForDraw = 1,
                    pointsForLoss = 0,
                ),
                selectedSport = sport,
            ),
        )
    }

    @OptIn(ExperimentalTime::class)
    @Test
    fun default_competition_timeslot_uses_the_event_window_and_all_resources_and_divisions() {
        val start = Instant.parse("2026-07-20T18:00:00Z")
        val end = Instant.parse("2026-07-20T20:00:00Z")
        val slot = createSimpleSetupEventRangeSlot(
            event = Event(
                start = start,
                end = end,
                timeZone = "UTC",
                divisions = listOf("open", "competitive"),
            ),
            fields = listOf(
                Field(id = "field-1", fieldNumber = 1),
                Field(id = "field-2", fieldNumber = 2),
            ),
            slotId = "slot-1",
        )

        assertFalse(slot.repeating)
        assertEquals(start, slot.startDate)
        assertEquals(end, slot.endDate)
        assertEquals(listOf("field-1", "field-2"), slot.scheduledFieldIds)
        assertEquals(listOf("open", "competitive"), slot.divisions)
        assertEquals(18 * 60, slot.startTimeMinutes)
        assertEquals(20 * 60, slot.endTimeMinutes)
    }

    @Test
    fun turning_off_paid_registration_clears_all_hidden_payment_state() {
        val updated = Event(
            priceCents = 2500,
            registrationPaymentMode = REGISTRATION_PAYMENT_MODE_MANUAL,
            cancellationRefundHours = 24,
            allowPaymentPlans = true,
            installmentCount = 2,
            installmentAmounts = listOf(1250, 1250),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    price = 2500,
                    allowPaymentPlans = true,
                    installmentCount = 2,
                    installmentAmounts = listOf(1250, 1250),
                ),
            ),
        ).withSimplePaidRegistration(false)

        assertEquals(0, updated.priceCents)
        assertFalse(updated.hasPaidRegistration())
        assertNull(updated.cancellationRefundHours)
        assertFalse(updated.allowPaymentPlans == true)
        assertTrue(updated.installmentAmounts.isEmpty())
        assertTrue(updated.divisionDetails.all { detail -> detail.price == 0 })
        assertTrue(updated.divisionDetails.all { detail -> detail.allowPaymentPlans == false })
    }

    @Test
    fun turning_off_team_registration_clears_team_only_children() {
        val updated = Event(
            eventType = EventType.EVENT,
            teamSignup = true,
            doTeamsOfficiate = true,
            teamOfficialsMaySwap = true,
            teamCheckInMode = TeamCheckInMode.MATCH,
            allowMatchRosterEdits = true,
            allowTemporaryMatchPlayers = true,
        ).withSimpleTeamRegistration(false)

        assertFalse(updated.teamSignup)
        assertFalse(updated.doTeamsOfficiate == true)
        assertFalse(updated.teamOfficialsMaySwap == true)
        assertEquals(TeamCheckInMode.OFF, updated.teamCheckInMode)
        assertFalse(updated.allowMatchRosterEdits)
        assertFalse(updated.allowTemporaryMatchPlayers)
    }

    @Test
    fun manual_payments_clear_online_refund_and_installment_children() {
        val updated = Event(
            priceCents = 2500,
            cancellationRefundHours = 24,
            allowPaymentPlans = true,
            installmentCount = 2,
            installmentAmounts = listOf(1250, 1250),
        ).withSimpleManualRegistrationPayments(
            enabled = true,
            paidRegistrationEnabled = true,
        )

        assertEquals(REGISTRATION_PAYMENT_MODE_MANUAL, updated.registrationPaymentMode)
        assertNull(updated.cancellationRefundHours)
        assertFalse(updated.allowPaymentPlans == true)
        assertTrue(updated.installmentAmounts.isEmpty())
    }

    @Test
    fun disabling_double_elimination_normalizes_event_and_division_brackets() {
        val updated = Event(
            eventType = EventType.TOURNAMENT,
            doubleElimination = true,
            loserSetCount = 3,
            loserBracketPointsToVictory = listOf(21, 21, 15),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    playoffConfig = TournamentConfig(
                        doubleElimination = true,
                        loserSetCount = 3,
                        loserBracketPointsToVictory = listOf(21, 21, 15),
                    ),
                ),
            ),
        ).withSimpleDoubleElimination(false)

        assertFalse(updated.doubleElimination)
        assertEquals(1, updated.loserSetCount)
        assertTrue(updated.loserBracketPointsToVictory.isEmpty())
        assertFalse(updated.divisionDetails.single().playoffConfig?.doubleElimination == true)
    }
}
