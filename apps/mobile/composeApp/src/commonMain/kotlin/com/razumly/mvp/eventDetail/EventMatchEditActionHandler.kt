@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.eventDetail.data.IMatchRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlin.time.Clock

internal class EventMatchEditActionHandler(
    private val scope: CoroutineScope,
    private val matchEditingCoordinator: EventMatchEditingCoordinator,
    private val bracketRoundsCoordinator: EventBracketRoundsCoordinator,
    private val notificationCoordinator: EventNotificationCoordinator,
    private val matchRepository: IMatchRepository,
    private val loadingHandler: () -> LoadingHandler,
    private val selectedEvent: () -> Event,
    private val selectedDivisionId: () -> String?,
    private val eventWithRelations: () -> EventWithFullRelations,
    private val divisionFields: () -> List<FieldWithMatches>,
    private val canManageMatchEditing: () -> Boolean,
    private val canEditMatchesNow: () -> Boolean,
    private val setError: (String) -> Unit,
) {
    fun refreshEditableRounds() {
        matchEditingCoordinator.refreshEditableRounds(
            event = selectedEvent(),
            selectedDivisionId = selectedDivisionId(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    private fun createStagedMatch(
        creationContext: MatchCreateContext,
        seed: MatchMVP? = null,
        openEditor: Boolean = false,
    ): MatchWithRelations? {
        return matchEditingCoordinator.createStagedMatchIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            input = StagedMatchInput(
                event = selectedEvent(),
                selectedDivisionId = selectedDivisionId(),
                creationContext = creationContext,
                seed = seed,
                clientId = newId(),
                now = Clock.System.now(),
            ),
            openEditor = openEditor,
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        ) { relation, context, isCreateMode ->
            showMatchEditDialog(
                match = relation,
                creationContext = context,
                isCreateMode = isCreateMode,
            )
        }
    }

    fun startEditingMatches() {
        scope.launch {
            matchEditingCoordinator.beginEditingIfAllowed(
                canManageMatchEditing = canManageMatchEditing(),
                matches = eventWithRelations().matches,
                event = selectedEvent(),
                selectedDivisionId = selectedDivisionId(),
                buildRounds = bracketRoundsCoordinator::buildBracketRounds,
            )
        }
    }

    fun cancelEditingMatches() {
        matchEditingCoordinator.cancelEditing()
    }

    fun commitMatchChanges() {
        if (!canEditMatchesNow()) return
        scope.launch {
            val loadingOperation = loadingHandler().newOperation()
            when (val result = matchEditingCoordinator.commitChanges(
                isTournament = selectedEvent().eventType == EventType.TOURNAMENT,
                updateMatchesBulk = { payload ->
                    matchRepository.updateMatchesBulk(payload.updates, payload.creates, payload.deletes)
                },
                onCommitStarted = { loadingOperation.showLoading("Updating matches...") },
                onCommitFinished = loadingOperation::hideLoading,
            )) {
                MatchEditCommitResult.Success -> Unit
                is MatchEditCommitResult.Invalid -> setError(result.errorMessage)
                is MatchEditCommitResult.Failure -> {
                    setError(result.throwable.userMessage("Failed to update matches"))
                }
            }
        }
    }

    fun updateEditableMatch(matchId: String, updater: (MatchMVP) -> MatchMVP) {
        matchEditingCoordinator.updateEditableMatch(
            matchId = matchId,
            event = selectedEvent(),
            selectedDivisionId = selectedDivisionId(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
            updater = updater,
        )
    }

    fun setLockForEditableMatches(matchIds: List<String>, locked: Boolean) {
        matchEditingCoordinator.setLockForEditableMatchesIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            matchIds = matchIds,
            locked = locked,
            event = selectedEvent(),
            selectedDivisionId = selectedDivisionId(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    fun addScheduleMatch() {
        createStagedMatch(MatchCreateContext.SCHEDULE, openEditor = true)
    }

    fun addBracketMatch() {
        createStagedMatch(MatchCreateContext.BRACKET, openEditor = true)
    }

    fun addBracketMatchFromAnchor(anchorMatchId: String, slot: BracketAddSlot) {
        matchEditingCoordinator.addBracketMatchFromAnchorIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            anchorMatchId = anchorMatchId,
            slot = slot,
            event = selectedEvent(),
            selectedDivisionId = selectedDivisionId(),
            clientId = newId(),
            now = Clock.System.now(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    fun showTeamSelection(matchId: String, position: TeamPosition) {
        matchEditingCoordinator.showTeamSelection(matchId, position, eventWithRelations().teams)
    }

    fun selectTeamForMatch(matchId: String, position: TeamPosition, teamId: String?) {
        matchEditingCoordinator.selectTeamForMatch(
            matchId = matchId,
            position = position,
            teamId = teamId,
            event = selectedEvent(),
            selectedDivisionId = selectedDivisionId(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    fun dismissTeamSelection() {
        matchEditingCoordinator.dismissTeamSelection()
    }

    fun showMatchEditDialog(
        match: MatchWithRelations,
        creationContext: MatchCreateContext,
        isCreateMode: Boolean,
    ) {
        matchEditingCoordinator.showMatchEditDialogIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            match = match,
            teams = eventWithRelations().teams,
            fields = divisionFields(),
            fallbackMatches = eventWithRelations().matches,
            event = selectedEvent(),
            players = eventWithRelations().players,
            isCreateMode = isCreateMode,
            creationContext = creationContext,
        )
    }

    suspend fun sendNotification(title: String, message: String): Result<Unit> {
        val event = eventWithRelations().event
        return notificationCoordinator.sendEventNotification(
            event.id,
            event.eventType,
            title,
            message,
        )
    }

    fun dismissMatchEditDialog() {
        matchEditingCoordinator.dismissMatchEditDialog(
            event = selectedEvent(),
            selectedDivisionId = selectedDivisionId(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    fun deleteMatchFromDialog(matchId: String) {
        matchEditingCoordinator.deleteMatchFromDialogIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            matchId = matchId,
            event = selectedEvent(),
            selectedDivisionId = selectedDivisionId(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }

    fun updateMatchFromDialog(updatedMatch: MatchWithRelations) {
        matchEditingCoordinator.updateMatchFromDialogIfEditable(
            canEditMatchesNow = canEditMatchesNow(),
            updatedMatch = updatedMatch,
            event = selectedEvent(),
            selectedDivisionId = selectedDivisionId(),
            buildRounds = bracketRoundsCoordinator::buildBracketRounds,
        )
    }
}
