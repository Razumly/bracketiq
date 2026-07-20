package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventTag
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ISportsRepository
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.ErrorMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

internal class EventResourceLifecycleHandler(
    private val scope: CoroutineScope,
    private val sportsRepository: ISportsRepository,
    private val eventRepository: IEventRepository,
    private val billingRepository: IBillingRepository,
    private val matchRepository: IMatchRepository,
    private val editDraftCoordinator: EventEditDraftCoordinator,
    private val divisionContentCoordinator: EventDivisionContentCoordinator,
    private val sportsCatalogCoordinator: EventSportsCatalogCoordinator,
    private val organizationTemplatesCoordinator: EventOrganizationTemplatesCoordinator,
    private val leagueStandingsCoordinator: EventLeagueStandingsCoordinator,
    private val loadingHandler: () -> LoadingHandler,
    private val selectedEvent: () -> Event,
    private val selectedDivisionId: () -> String?,
    private val selectDivision: (String) -> Unit,
    private val refreshSelectedDivisionContent: () -> Unit,
    private val setEventTags: (List<EventTag>) -> Unit,
    private val setError: (ErrorMessage?) -> Unit,
) {
    private var sportsLoadJob: Job? = null

    fun handleEventRelationsChanged(relations: EventWithFullRelations) {
        if (!canEditEventDetails(relations.event) && editDraftCoordinator.isEditing.value) {
            editDraftCoordinator.forceExitEditing(relations.event)
        }
        editDraftCoordinator.replaceReadOnlyTimeSlots(
            event = relations.event,
            timeSlots = relations.timeSlots,
        )
        val activeDivision = divisionContentCoordinator.currentSelectedDivision()
            ?: relations.event.resolveDefaultSelectedDivisionId()
        if (!activeDivision.isNullOrBlank()) {
            selectDivision(activeDivision)
        } else {
            refreshSelectedDivisionContent()
        }
    }

    fun handleDefaultDivisionChanged(divisionId: String?) {
        val resolvedDivisionId = divisionId
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
            ?: return
        val availableDivisionIds = selectedEvent().divisions
            .map(String::normalizeDivisionIdentifier)
            .filter(String::isNotBlank)
            .toSet()
        val currentDivisionId = divisionContentCoordinator.currentSelectedDivision()
            ?.normalizeDivisionIdentifier()
            ?.takeIf(String::isNotBlank)
        if (currentDivisionId == null || (availableDivisionIds.isNotEmpty() && currentDivisionId !in availableDivisionIds)) {
            selectDivision(resolvedDivisionId)
        }
    }

    fun handleReadOnlyDraftStateChanged(state: EventDetailReadOnlyDraftBindingState) {
        if (state.editing) return
        editDraftCoordinator.refreshReadOnlyDraft(
            event = state.relations.event,
            sourceFields = state.fields,
            leagueScoringConfig = state.relations.leagueScoringConfig?.toDto()
                ?: LeagueScoringConfigDTO(),
        )
    }

    fun handleSelectedDivisionChanged(@Suppress("UNUSED_PARAMETER") divisionId: String?) {
        divisionContentCoordinator.currentSelectedDivision()?.let(selectDivision)
    }

    fun resolveLeagueStandingsLifecycleTarget(
        event: Event,
        divisionId: String?,
    ): LeagueStandingsLoadTarget? = leagueStandingsCoordinator.resolveLoadTarget(
        event = event,
        selectedDivisionId = divisionId,
        isPlayoffPlacementDivision = event::isPlayoffPlacementDivision,
    )

    suspend fun loadLeagueStandingsLifecycleTarget(target: LeagueStandingsLoadTarget?) {
        leagueStandingsCoordinator.loadStandingsForSelection(
            target = target,
            showLoading = true,
            reportErrors = false,
            getStandings = eventRepository::getLeagueDivisionStandings,
        )?.let(setError)
    }

    fun loadSports(reportErrors: Boolean) {
        val loadInProgress = sportsLoadJob?.isActive == true
        if (!sportsCatalogCoordinator.prepareLoad(reportErrors, loadInProgress)) {
            return
        }
        sportsLoadJob = scope.launch {
            var loadedSports = false
            var loadedDivisionTypes = false
            sportsRepository.getSports()
                .onSuccess { sports ->
                    loadedSports = true
                    sportsCatalogCoordinator.applySportsSuccess(sports)
                    if (editDraftCoordinator.isEditing.value) {
                        editDraftCoordinator.updateEditedEvent { previous ->
                            sportsCatalogCoordinator.syncOfficialStaffingForSportTransition(
                                previous = previous,
                                updated = previous,
                            )
                        }
                    }
                }
                .onFailure {
                    Napier.w("Failed to load sports.", it)
                    if (sportsCatalogCoordinator.shouldReportLoadErrors(editDraftCoordinator.isEditing.value)) {
                        setError(ErrorMessage("Failed to load sports: ${it.userMessage()}"))
                    }
                }
            sportsRepository.getDivisionTypeParameters()
                .onSuccess { parameters ->
                    loadedDivisionTypes = true
                    sportsCatalogCoordinator.applyDivisionTypeParametersSuccess(parameters)
                }
                .onFailure {
                    Napier.w("Failed to load division options.", it)
                    if (sportsCatalogCoordinator.shouldReportLoadErrors(editDraftCoordinator.isEditing.value)) {
                        setError(ErrorMessage("Failed to load division options: ${it.userMessage()}"))
                    }
                }
            sportsCatalogCoordinator.finishLoad(loadedSports, loadedDivisionTypes)
        }
    }

    fun loadEventTags() {
        scope.launch {
            eventRepository.getEventTags()
                .onSuccess(setEventTags)
                .onFailure { error ->
                    setError(ErrorMessage("Failed to load event tags: ${error.userMessage()}"))
                }
        }
    }

    suspend fun loadOrganizationTemplates(organizationId: String) {
        if (organizationId.isBlank()) {
            organizationTemplatesCoordinator.clear()
            return
        }

        organizationTemplatesCoordinator.beginLoad()
        billingRepository.listOrganizationTemplates(organizationId)
            .onSuccess(organizationTemplatesCoordinator::applyLoadSuccess)
            .onFailure { throwable ->
                Napier.w("Failed to load templates for organization $organizationId.", throwable)
                organizationTemplatesCoordinator.applyLoadFailure(
                    throwable.userMessage("Failed to load templates."),
                )
            }
        organizationTemplatesCoordinator.finishLoad()
    }

    suspend fun refreshLeagueStandingsAfterSchedule(event: Event) {
        val target = leagueStandingsCoordinator.resolveScheduleRefreshTarget(
            event = event,
            divisionId = resolveLeagueStandingsDivisionId(),
        ) ?: return
        leagueStandingsCoordinator.loadDivisionStandings(
            target = target,
            showLoading = false,
            reportErrors = false,
            getStandings = eventRepository::getLeagueDivisionStandings,
        )
    }

    fun refreshLeagueStandings() {
        val target = leagueStandingsCoordinator.resolveCurrentLoadTarget(
            eventId = selectedEvent().id,
            divisionId = resolveLeagueStandingsDivisionId(),
        ) ?: return
        scope.launch {
            leagueStandingsCoordinator.loadDivisionStandings(
                target = target,
                showLoading = true,
                reportErrors = true,
                getStandings = eventRepository::getLeagueDivisionStandings,
            )?.let(setError)
        }
    }

    fun confirmLeagueStandings(applyReassignment: Boolean) {
        val event = selectedEvent()
        val target = leagueStandingsCoordinator.resolveScheduleRefreshTarget(
            event = event,
            divisionId = resolveLeagueStandingsDivisionId(),
        )
        if (target == null) {
            setError(ErrorMessage("Select a standings division before confirming standings."))
            return
        }

        scope.launch {
            setError(
                leagueStandingsCoordinator.confirmStandings(
                    target = target,
                    applyReassignment = applyReassignment,
                    loadingHandler = loadingHandler(),
                    confirmStandings = eventRepository::confirmLeagueDivisionStandings,
                    refreshMatches = { eventId -> matchRepository.getMatchesOfTournament(eventId) },
                    refreshEvent = { eventId -> eventRepository.getEvent(eventId) },
                )
            )
        }
    }

    fun startEditingLeagueStandingsPoints() {
        if (!leagueStandingsCoordinator.beginPointsEditing()) {
            setError(ErrorMessage("Load a standings division with teams before managing points."))
        }
    }

    fun adjustLeagueStandingsPoints(teamId: String, delta: Double) {
        if (!leagueStandingsCoordinator.adjustDraftPoints(teamId, delta)) {
            setError(ErrorMessage("Unable to adjust standings points for that team."))
        }
    }

    fun cancelEditingLeagueStandingsPoints() {
        leagueStandingsCoordinator.cancelPointsEditing()
    }

    fun saveLeagueStandingsPoints() {
        val target = leagueStandingsCoordinator.resolveCurrentLoadTarget(
            eventId = selectedEvent().id,
            divisionId = resolveLeagueStandingsDivisionId(),
        )
        if (target == null) {
            setError(ErrorMessage("Select a standings division before saving point adjustments."))
            return
        }
        scope.launch {
            setError(
                leagueStandingsCoordinator.savePointsEdits(
                    target = target,
                    updateStandings = eventRepository::updateLeagueDivisionStandings,
                )
            )
        }
    }

    private fun resolveLeagueStandingsDivisionId(): String? =
        leagueStandingsCoordinator.resolveCurrentDivisionId(
            selectedDivisionId = selectedDivisionId(),
            isSelectedDivisionEligible = { divisionId ->
                !selectedEvent().isPlayoffPlacementDivision(divisionId)
            },
        )
}
