package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.TournamentConfig
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.RegistrationQuestionDraft
import com.razumly.mvp.core.network.dto.toUpdateDto
import kotlin.time.ExperimentalTime
import kotlin.time.Instant
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventCreateSimpleSetupTest {

    @Test
    fun redundant_schedule_and_competition_planning_pages_are_not_part_of_simple_setup() {
        assertEquals(14, EventCreateSetupPageId.entries.size)
        assertFalse(EventCreateSetupPageId.entries.any { page -> page.label == "Schedule Plan" })
        assertFalse(EventCreateSetupPageId.entries.any { page -> page.label == "Competition Plan" })
    }

    @Test
    fun mobile_creation_types_exclude_tryouts() {
        assertEquals(
            listOf(EventType.EVENT, EventType.WEEKLY_EVENT, EventType.LEAGUE, EventType.TOURNAMENT),
            mobileCreateEventTypes(),
        )
        assertFalse(EventType.TRYOUT in mobileCreateEventTypes())
    }

    @Test
    fun event_path_marks_competition_and_unselected_optional_pages_unused() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT, teamSignup = false),
            choices = EventCreateSetupChoices(),
            currentPageId = EventCreateSetupPageId.FORMAT,
            completedPageIds = emptySet(),
        )

        assertFalse(pages.first { it.id == EventCreateSetupPageId.COMPETITION_RULES }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.RESOURCES }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.TIMESLOTS }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.QUESTIONS }.used)
        assertFalse(pages.first { it.id == EventCreateSetupPageId.STAFF_OPERATIONS }.used)
    }

    @Test
    fun league_path_keeps_competition_and_team_operations_available() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.LEAGUE, teamSignup = true),
            choices = EventCreateSetupChoices(),
            currentPageId = EventCreateSetupPageId.FORMAT,
            completedPageIds = setOf(EventCreateSetupPageId.FORMAT),
        )

        assertTrue(pages.first { it.id == EventCreateSetupPageId.COMPETITION_RULES }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.RESOURCES }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.TIMESLOTS }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.STAFF_OPERATIONS }.used)
        assertEquals(
            EventCreateSetupPageStatus.AVAILABLE,
            pages.first { it.id == EventCreateSetupPageId.BASICS }.status,
        )
    }

    @Test
    fun optional_choices_enable_dependent_pages() {
        val choices = EventCreateSetupChoices(
            useRegistrationQuestions = true,
            useDedicatedOfficials = true,
        )
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT),
            choices = choices,
            currentPageId = EventCreateSetupPageId.REGISTRATION_PLAN,
            completedPageIds = EventCreateSetupPageId.entries.toSet(),
        )

        assertTrue(pages.first { it.id == EventCreateSetupPageId.QUESTIONS }.used)
        assertTrue(pages.first { it.id == EventCreateSetupPageId.STAFF_OPERATIONS }.used)
    }

    @Test
    fun next_and_previous_navigation_skip_unused_pages() {
        val pages = resolveEventCreateSetupPages(
            event = Event(eventType = EventType.EVENT),
            choices = EventCreateSetupChoices(),
            currentPageId = EventCreateSetupPageId.SCHEDULE_LOCATION,
            completedPageIds = EventCreateSetupPageId.entries.toSet(),
        )

        assertEquals(
            EventCreateSetupPageId.REGISTRATION_PLAN,
            nextUsedSetupPage(pages, EventCreateSetupPageId.SCHEDULE_LOCATION),
        )
        assertEquals(
            EventCreateSetupPageId.SCHEDULE_LOCATION,
            previousUsedSetupPage(pages, EventCreateSetupPageId.REGISTRATION_PLAN),
        )
        assertNull(nextUsedSetupPage(pages, EventCreateSetupPageId.REVIEW_PUBLISH))
    }

    @Test
    fun basics_and_schedule_completion_use_required_draft_values() {
        val event = Event(
            name = "Summer League",
            sportId = "basketball",
            location = "Main Gym",
            coordinates = listOf(45.5, -122.6),
            noFixedEndDateTime = true,
        )

        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.BASICS, event))
        assertTrue(isSimpleSetupPageComplete(EventCreateSetupPageId.SCHEDULE_LOCATION, event))
        assertFalse(isSimpleSetupPageComplete(EventCreateSetupPageId.DIVISIONS, event))
    }

    @Test
    fun simple_division_upsert_creates_one_canonical_detail_per_selection() {
        val selection = SimpleSetupDivisionSelection(
            gender = "C",
            skillDivisionTypeId = "competitive",
            skillDivisionTypeName = "Competitive",
            ageDivisionTypeId = "adult",
            ageDivisionTypeName = "Adult",
        )
        val event = Event(
            id = "event-1",
            singleDivision = true,
            priceCents = 2_500,
            maxParticipants = 12,
        )

        val firstUpdate = event.upsertSimpleSetupDivision(selection)
        val secondUpdate = firstUpdate.upsertSimpleSetupDivision(selection)

        assertEquals(1, secondUpdate.divisions.size)
        assertEquals(1, secondUpdate.divisionDetails.size)
        assertEquals(firstUpdate.divisionDetails.single().id, secondUpdate.divisionDetails.single().id)
        assertEquals("Coed Competitive Adult", secondUpdate.divisionDetails.single().name)
        assertEquals(2_500, secondUpdate.divisionDetails.single().price)
        assertEquals(12, secondUpdate.divisionDetails.single().maxParticipants)
    }

    @Test
    fun editing_a_division_replaces_the_selected_card_instead_of_adding_another() {
        val original = SimpleSetupDivisionSelection(
            gender = "M",
            skillDivisionTypeId = "recreational",
            skillDivisionTypeName = "Recreational",
            ageDivisionTypeId = "u10",
            ageDivisionTypeName = "U10",
        )
        val replacement = original.copy(
            skillDivisionTypeId = "competitive",
            skillDivisionTypeName = "Competitive",
        )
        val event = Event(id = "event-1").upsertSimpleSetupDivision(original)
        val divisionId = event.divisionDetails.single().id

        val updated = event.upsertSimpleSetupDivision(replacement, replacingDivisionId = divisionId)

        assertEquals(1, updated.divisionDetails.size)
        assertEquals(divisionId, updated.divisionDetails.single().id)
        assertEquals("Men's Competitive U10", updated.divisionDetails.single().name)
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
    fun timed_and_set_rule_edits_only_write_values_for_the_selected_sport_structure() {
        val division = DivisionDetail(
            id = "open",
            playoffConfig = TournamentConfig(),
        )
        val timed = Event(divisionDetails = listOf(division), usesSets = true)
            .withSimpleTimedMatchDuration(totalMinutes = 50, segmentCount = 2)

        assertFalse(timed.usesSets)
        assertEquals(50, timed.matchDurationMinutes)
        assertEquals(25, timed.matchRulesOverride?.timekeeping?.segmentDurationMinutes)
        assertEquals(emptyList(), timed.pointsToVictory)

        val setBased = timed.withSimpleSetPointTargets(listOf(21, 21, 15))

        assertTrue(setBased.usesSets)
        assertEquals(3, setBased.setsPerMatch)
        assertEquals(listOf(21, 21, 15), setBased.pointsToVictory)
        assertEquals(listOf(21, 21, 15), setBased.winnerBracketPointsToVictory)
        assertEquals(
            listOf(21, 21, 15),
            setBased.divisionDetails.single().playoffConfig?.winnerBracketPointsToVictory,
        )
    }

    @Test
    fun resizing_set_targets_keeps_the_deciding_set_score_last() {
        assertEquals(
            listOf(21, 21, 21, 21, 15),
            resizeSimpleSetPointTargets(
                currentTargets = listOf(21, 21, 15),
                setCount = 5,
                sportDefaults = listOf(21, 21, 15),
            ),
        )
        assertEquals(
            listOf(21, 21, 15),
            resizeSimpleSetPointTargets(
                currentTargets = listOf(21, 21, 21, 21, 15),
                setCount = 3,
                sportDefaults = listOf(21, 21, 15),
            ),
        )
        assertEquals(
            listOf(21),
            resizeSimpleSetPointTargets(
                currentTargets = listOf(21, 21, 15),
                setCount = 1,
                sportDefaults = listOf(21, 21, 15),
            ),
        )
    }

    @Test
    fun tournament_pool_configuration_maps_pool_and_bracket_values_to_the_create_payload() {
        val configured = Event(
            id = "tournament-1",
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            maxParticipants = 12,
            divisions = listOf("open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    name = "Open",
                    maxParticipants = 12,
                ),
            ),
        ).withSimpleTournamentPoolConfiguration(
            poolCount = 3,
            bracketTeamCount = 6,
        )

        assertEquals(3, configured.divisionDetails.single().poolCount)
        assertEquals(4, configured.divisionDetails.single().poolTeamCount)
        assertEquals(6, configured.divisionDetails.single().playoffTeamCount)
        assertTrue(simpleTournamentPoolValidationErrors(configured).isEmpty())

        val payload = configured.toUpdateDto()
        assertTrue(payload.divisionDetails.orEmpty().isEmpty())
        assertEquals(3, payload.playoffDivisionDetails.single().poolCount)
        assertEquals(4, payload.playoffDivisionDetails.single().poolTeamCount)
        assertEquals(6, payload.playoffDivisionDetails.single().playoffTeamCount)
    }

    @Test
    fun tournament_pool_validation_requires_divisible_capacity_and_bracket_advancement() {
        val base = Event(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            maxParticipants = 10,
            divisions = listOf("open"),
            divisionDetails = listOf(DivisionDetail(id = "open", maxParticipants = 10)),
        )

        assertContains(simpleTournamentPoolValidationErrors(base), "Choose at least one pool.")

        val invalidCapacity = base.withSimpleTournamentPoolConfiguration(
            poolCount = 3,
            bracketTeamCount = 6,
        )
        assertContains(
            simpleTournamentPoolValidationErrors(invalidCapacity),
            "Maximum teams must divide evenly by the pool count.",
        )

        val invalidAdvancement = base
            .withSimpleSetupRegistrationValues(maxParticipants = 12)
            .withSimpleTournamentPoolConfiguration(poolCount = 3, bracketTeamCount = 8)
        assertContains(
            simpleTournamentPoolValidationErrors(invalidAdvancement),
            "Bracket teams must divide evenly by the pool count.",
        )
    }

    @Test
    fun tournament_pool_page_defers_capacity_math_until_registration_capacity_is_entered() {
        val awaitingCapacity = Event(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            maxParticipants = 2,
            divisions = listOf("open"),
            divisionDetails = listOf(DivisionDetail(id = "open", maxParticipants = 2)),
        ).withSimpleTournamentPoolConfiguration(poolCount = 2, bracketTeamCount = 4)

        assertTrue(
            isSimpleSetupPageComplete(
                pageId = EventCreateSetupPageId.COMPETITION_RULES,
                event = awaitingCapacity,
            ),
        )
        assertContains(
            simpleTournamentPoolValidationErrors(awaitingCapacity),
            "Bracket teams cannot exceed maximum teams.",
        )
    }

    @Test
    fun tournament_pool_derived_values_follow_capacity_and_clear_when_pool_play_is_disabled() {
        val configured = Event(
            eventType = EventType.TOURNAMENT,
            includePlayoffs = true,
            maxParticipants = 8,
            divisionDetails = listOf(DivisionDetail(id = "open", maxParticipants = 8)),
        ).withSimpleTournamentPoolConfiguration(poolCount = 2, bracketTeamCount = 4)

        val resized = configured.withSimpleSetupRegistrationValues(maxParticipants = 12)
        assertEquals(6, resized.divisionDetails.single().poolTeamCount)

        val disabled = resized.withSimpleTournamentPoolPlayEnabled(false)
        assertFalse(disabled.includePlayoffs)
        assertNull(disabled.playoffTeamCount)
        assertNull(disabled.divisionDetails.single().poolCount)
        assertNull(disabled.divisionDetails.single().poolTeamCount)
        assertNull(disabled.divisionDetails.single().playoffTeamCount)
    }

    @Test
    fun tournament_bracket_format_updates_each_division_payload() {
        val updated = Event(
            eventType = EventType.TOURNAMENT,
            divisionDetails = listOf(DivisionDetail(id = "open")),
        ).withSimpleTournamentDoubleElimination(true)

        assertTrue(updated.doubleElimination)
        assertTrue(updated.divisionDetails.single().playoffConfig?.doubleElimination == true)
    }

    @Test
    fun custom_set_count_overrides_the_sport_default_on_the_simple_rules_page() {
        assertEquals(
            5,
            resolveSimpleCompetitionSegmentCount(
                event = Event(
                    eventType = EventType.LEAGUE,
                    setsPerMatch = 5,
                ),
                scoringModel = "SETS",
                sportSegmentCount = 3,
            ),
        )
        assertEquals(
            2,
            resolveSimpleCompetitionSegmentCount(
                event = Event(
                    eventType = EventType.LEAGUE,
                    setsPerMatch = 5,
                ),
                scoringModel = "PERIODS",
                sportSegmentCount = 2,
            ),
        )
    }

    @Test
    fun registration_values_are_applied_to_event_and_every_division() {
        val event = Event(
            priceCents = 500,
            maxParticipants = 4,
            divisionDetails = listOf(
                DivisionDetail(id = "open"),
                DivisionDetail(id = "advanced"),
            ),
        )

        val updated = event.withSimpleSetupRegistrationValues(
            priceCents = 3_000,
            maxParticipants = 16,
        )

        assertEquals(3_000, updated.priceCents)
        assertEquals(16, updated.maxParticipants)
        assertTrue(updated.divisionDetails.all { detail -> detail.price == 3_000 })
        assertTrue(updated.divisionDetails.all { detail -> detail.maxParticipants == 16 })
    }

    @Test
    fun review_validation_covers_compact_flow_requirements() {
        val choices = EventCreateSetupChoices(
            paidRegistration = true,
            useRegistrationQuestions = true,
        )
        val validDraft = Event(
            name = "Summer League",
            sportId = "volleyball",
            divisions = listOf("open"),
            divisionDetails = listOf(DivisionDetail(id = "open")),
            location = "Main Gym",
            coordinates = listOf(-122.6, 45.5),
            noFixedEndDateTime = true,
            maxParticipants = 12,
            priceCents = 2_500,
        )
        val questions = listOf(
            RegistrationQuestionDraft(
                prompt = "What position do you play?",
                required = true,
            ),
        )

        val awaitingQuoteErrors = simpleSetupValidationErrors(
            event = validDraft,
            choices = choices,
            priceQuoteConfirmed = false,
            registrationQuestions = questions,
        )

        assertContains(awaitingQuoteErrors, "Wait for the online price quote.")
        assertFalse(
            isSimpleSetupPageComplete(
                EventCreateSetupPageId.REVIEW_PUBLISH,
                validDraft,
                choices,
                priceQuoteConfirmed = false,
                registrationQuestions = questions,
            ),
        )
        assertTrue(
            isSimpleSetupPageComplete(
                EventCreateSetupPageId.REVIEW_PUBLISH,
                validDraft,
                choices,
                priceQuoteConfirmed = true,
                registrationQuestions = questions,
            ),
        )
    }

    @Test
    fun registration_questions_require_at_least_one_nonblank_mobile_draft() {
        val choices = EventCreateSetupChoices(useRegistrationQuestions = true)
        val blankDraft = RegistrationQuestionDraft(prompt = "   ")

        assertFalse(
            isSimpleSetupPageComplete(
                pageId = EventCreateSetupPageId.QUESTIONS,
                event = Event(),
                choices = choices,
                registrationQuestions = emptyList(),
            ),
        )
        assertContains(
            simpleSetupValidationErrors(
                event = Event(),
                choices = choices,
                priceQuoteConfirmed = true,
                registrationQuestions = listOf(blankDraft),
            ),
            "Registration questions cannot be blank.",
        )
        assertTrue(
            isSimpleSetupPageComplete(
                pageId = EventCreateSetupPageId.QUESTIONS,
                event = Event(),
                choices = choices,
                registrationQuestions = listOf(RegistrationQuestionDraft(prompt = "Jersey size?")),
            ),
        )
    }
}
