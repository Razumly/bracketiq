package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameterOption
import com.razumly.mvp.core.data.dataTypes.DivisionTypeParameters
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.SportOfficialPositionTemplate
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.eventCreate.createSport
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventSportsCatalogCoordinatorTest {
    @Test
    fun prepare_load_remembers_report_errors_while_load_is_active() {
        val coordinator = EventSportsCatalogCoordinator()

        assertFalse(coordinator.shouldReportLoadErrors(isEditing = false))
        assertFalse(coordinator.prepareLoad(reportErrors = true, loadInProgress = true))

        assertTrue(coordinator.shouldReportLoadErrors(isEditing = false))

        coordinator.finishLoad(loadedSports = false, loadedDivisionTypes = false)

        assertFalse(coordinator.shouldReportLoadErrors(isEditing = false))
        assertFalse(coordinator.isCatalogLoaded())
    }

    @Test
    fun successful_load_updates_catalog_state_and_loaded_flag() {
        val coordinator = EventSportsCatalogCoordinator()
        val sports = listOf(createSport(id = "sport-1", usePointsPerSetWin = true))
        val parameters = DivisionTypeParameters(
            genders = listOf(DivisionTypeParameterOption(id = "coed", name = "Coed")),
        )

        assertTrue(coordinator.prepareLoad(reportErrors = false, loadInProgress = false))
        coordinator.applySportsSuccess(sports)
        coordinator.applyDivisionTypeParametersSuccess(parameters)
        coordinator.finishLoad(loadedSports = true, loadedDivisionTypes = true)

        assertEquals(sports, coordinator.sports.value)
        assertEquals(parameters, coordinator.divisionTypeParameters.value)
        assertEquals(sports.single(), coordinator.sportForId(" sport-1 "))
        assertTrue(coordinator.isCatalogLoaded())
    }

    @Test
    fun sport_transition_applies_sport_rules_and_replaces_previous_default_official_positions() {
        val previousSport = createSport(id = "sport-old", usePointsPerSetWin = false).copy(
            officialPositionTemplates = listOf(SportOfficialPositionTemplate(name = "Referee", count = 1)),
        )
        val nextSport = createSport(id = "sport-new", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(SportOfficialPositionTemplate(name = "Line Judge", count = 2)),
        )
        val coordinator = EventSportsCatalogCoordinator()
        coordinator.applySportsSuccess(listOf(previousSport, nextSport))
        val previous = Event(
            id = "event-1",
            sportId = previousSport.id,
            eventType = EventType.LEAGUE,
            officialIds = listOf("official-1"),
        ).syncOfficialStaffing(sport = previousSport)

        val updated = coordinator.syncOfficialStaffingForSportTransition(
            previous = previous,
            updated = previous.copy(sportId = nextSport.id),
        )

        assertTrue(updated.usesSets)
        assertEquals(listOf("Line Judge"), updated.officialPositions.map(EventOfficialPosition::name))
        assertEquals(listOf(2), updated.officialPositions.map(EventOfficialPosition::count))
    }
}
