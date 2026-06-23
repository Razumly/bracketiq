package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.util.normalizeDivisionIdentifier
import com.razumly.mvp.eventDetail.data.StagedMatchCreate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.time.Duration.Companion.hours
import kotlin.time.Instant

private const val CLIENT_MATCH_PREFIX = "client:"
private const val LOCAL_PLACEHOLDER_PREFIX = "placeholder-local:"

internal data class StagedMatchInput(
    val event: Event,
    val selectedDivisionId: String?,
    val creationContext: MatchCreateContext,
    val seed: MatchMVP? = null,
    val clientId: String,
    val now: Instant,
)

internal data class PreparedMatchBulkUpdate(
    val updates: List<MatchMVP>,
    val creates: List<StagedMatchCreate>,
    val deletes: List<String>,
)

internal sealed class MatchEditCommitPreparation {
    data class Valid(val payload: PreparedMatchBulkUpdate) : MatchEditCommitPreparation()
    data class Invalid(val errorMessage: String) : MatchEditCommitPreparation()
}

internal class EventMatchEditingCoordinator {
    private val _isEditingMatches = MutableStateFlow(false)
    val isEditingMatches = _isEditingMatches.asStateFlow()

    private val _editableMatches = MutableStateFlow<List<MatchWithRelations>>(emptyList())
    val editableMatches = _editableMatches.asStateFlow()

    private val _editableRounds = MutableStateFlow<List<List<MatchWithRelations?>>>(emptyList())
    val editableRounds = _editableRounds.asStateFlow()

    private val _stagedMatchCreates = MutableStateFlow<Map<String, StagedMatchCreateMeta>>(emptyMap())
    private val _stagedMatchDeletes = MutableStateFlow<Set<String>>(emptySet())
    private var pendingCreateMatchId: String? = null

    private val _showTeamSelectionDialog = MutableStateFlow<TeamSelectionDialogState?>(null)
    val showTeamSelectionDialog = _showTeamSelectionDialog.asStateFlow()

    private val _showMatchEditDialog = MutableStateFlow<MatchEditDialogState?>(null)
    val showMatchEditDialog = _showMatchEditDialog.asStateFlow()

    fun canEditNow(canManageMatchEditing: Boolean): Boolean =
        _isEditingMatches.value && canManageMatchEditing

    fun beginEditing(
        matches: List<MatchWithRelations>,
        event: Event,
        selectedDivisionId: String?,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
    ) {
        _editableMatches.value = matches.map { matchRelation ->
            matchRelation.copy(match = matchRelation.match.copy())
        }
        _stagedMatchCreates.value = emptyMap()
        _stagedMatchDeletes.value = emptySet()
        pendingCreateMatchId = null
        refreshEditableRounds(event, selectedDivisionId, buildRounds)
        _isEditingMatches.value = true
    }

    fun cancelEditing() {
        _isEditingMatches.value = false
        _editableMatches.value = emptyList()
        _editableRounds.value = emptyList()
        _stagedMatchCreates.value = emptyMap()
        _stagedMatchDeletes.value = emptySet()
        pendingCreateMatchId = null
        _showTeamSelectionDialog.value = null
    }

    fun finishCommitSuccess() {
        _isEditingMatches.value = false
        _editableMatches.value = emptyList()
        _editableRounds.value = emptyList()
        _stagedMatchCreates.value = emptyMap()
        _stagedMatchDeletes.value = emptySet()
        pendingCreateMatchId = null
    }

    fun refreshEditableRounds(
        event: Event,
        selectedDivisionId: String?,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
    ) {
        val editable = _editableMatches.value
        if (editable.isEmpty()) {
            _editableRounds.value = emptyList()
            return
        }

        val divisionScopedMatches = if (!event.singleDivision && !selectedDivisionId.isNullOrEmpty()) {
            val normalizedActiveDivision = selectedDivisionId.normalizeDivisionIdentifier()
            editable.filter { relation ->
                relation.match.division?.normalizeDivisionIdentifier() == normalizedActiveDivision
            }
        } else {
            editable
        }

        val bracketMatches = divisionScopedMatches.filter { relation -> relation.hasBracketLinks() }
        if (bracketMatches.isEmpty()) {
            _editableRounds.value = emptyList()
            return
        }

        _editableRounds.value = buildRounds(bracketMatches.associateBy { match -> match.match.id })
    }

    fun createStagedMatch(
        input: StagedMatchInput,
        openEditor: Boolean,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
        showEditor: (MatchWithRelations, MatchCreateContext, Boolean) -> Unit = { _, _, _ -> },
    ): MatchWithRelations {
        val matchDocId = stagedClientMatchId(input.clientId)
        val isTournamentEvent = input.event.eventType == EventType.TOURNAMENT
        val defaultDivision = input.seed?.division.normalizedToken()
            ?: input.selectedDivisionId.normalizedToken()
            ?: input.event.divisions.firstOrNull()?.normalizeDivisionIdentifier()
        val placeholderId = "$LOCAL_PLACEHOLDER_PREFIX${placeholderCount() + 1}"
        val match = MatchMVP(
            id = matchDocId,
            matchId = nextEditableMatchNumber(),
            team1Id = if (isTournamentEvent) placeholderId else null,
            team2Id = null,
            team1Seed = input.seed?.team1Seed,
            team2Seed = input.seed?.team2Seed,
            eventId = input.event.id,
            officialId = null,
            fieldId = if (input.creationContext == MatchCreateContext.SCHEDULE) {
                input.seed?.fieldId.normalizedToken()
            } else {
                null
            },
            start = if (input.creationContext == MatchCreateContext.SCHEDULE) {
                input.seed?.start ?: input.now
            } else {
                null
            },
            end = if (input.creationContext == MatchCreateContext.SCHEDULE) {
                input.seed?.end ?: input.seed?.start?.plus(1.hours) ?: input.now.plus(1.hours)
            } else {
                null
            },
            division = defaultDivision,
            team1Points = emptyList(),
            team2Points = emptyList(),
            setResults = emptyList(),
            side = input.seed?.side,
            losersBracket = input.seed?.losersBracket ?: false,
            winnerNextMatchId = input.seed?.winnerNextMatchId.normalizedToken(),
            loserNextMatchId = input.seed?.loserNextMatchId.normalizedToken(),
            previousLeftId = input.seed?.previousLeftId.normalizedToken(),
            previousRightId = input.seed?.previousRightId.normalizedToken(),
            officialCheckedIn = false,
            teamOfficialId = null,
            locked = false,
        )
        val relation = relationFor(match)
        _editableMatches.value = _editableMatches.value + relation
        _stagedMatchCreates.value = _stagedMatchCreates.value + (
            matchDocId to StagedMatchCreateMeta(
                clientId = input.clientId,
                creationContext = input.creationContext,
                autoPlaceholderTeam = isTournamentEvent,
            )
            )
        refreshEditableRounds(input.event, input.selectedDivisionId, buildRounds)

        if (openEditor) {
            pendingCreateMatchId = matchDocId
            showEditor(relation, input.creationContext, true)
        }
        return relation
    }

    fun addBracketMatchFromAnchor(
        anchorMatchId: String,
        slot: BracketAddSlot,
        event: Event,
        selectedDivisionId: String?,
        clientId: String,
        now: Instant,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
    ): MatchWithRelations? {
        val normalizedAnchorId = anchorMatchId.normalizedToken() ?: return null
        val anchor = _editableMatches.value.firstOrNull { relation ->
            relation.match.id == normalizedAnchorId
        } ?: return null

        val staged = createStagedMatch(
            input = StagedMatchInput(
                event = event,
                selectedDivisionId = selectedDivisionId,
                creationContext = MatchCreateContext.BRACKET,
                seed = MatchMVP(
                    id = "seed",
                    matchId = 0,
                    eventId = anchor.match.eventId,
                    division = anchor.match.division,
                    losersBracket = anchor.match.losersBracket,
                    winnerNextMatchId = if (slot == BracketAddSlot.FINAL_WINNER_NEXT) null else normalizedAnchorId,
                    previousLeftId = if (slot == BracketAddSlot.FINAL_WINNER_NEXT) normalizedAnchorId else null,
                    previousRightId = null,
                ),
                clientId = clientId,
                now = now,
            ),
            openEditor = false,
            buildRounds = buildRounds,
        )

        updateEditableMatch(
            matchId = normalizedAnchorId,
            event = event,
            selectedDivisionId = selectedDivisionId,
            buildRounds = buildRounds,
        ) { match ->
            when (slot) {
                BracketAddSlot.PREVIOUS_LEFT -> match.copy(previousLeftId = staged.match.id)
                BracketAddSlot.PREVIOUS_RIGHT -> match.copy(previousRightId = staged.match.id)
                BracketAddSlot.FINAL_WINNER_NEXT -> match.copy(winnerNextMatchId = staged.match.id)
            }
        }
        return staged
    }

    fun updateEditableMatch(
        matchId: String,
        event: Event,
        selectedDivisionId: String?,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
        updater: (MatchMVP) -> MatchMVP,
    ) {
        val currentMatches = _editableMatches.value.toMutableList()
        val matchIndex = currentMatches.indexOfFirst { it.match.id == matchId }

        if (matchIndex != -1) {
            val currentMatch = currentMatches[matchIndex]
            currentMatches[matchIndex] = currentMatch.copy(match = updater(currentMatch.match))
            _editableMatches.value = normalizeEditableBracketGraph(currentMatches)
            refreshEditableRounds(event, selectedDivisionId, buildRounds)
        }
    }

    fun setLockForEditableMatches(
        matchIds: List<String>,
        locked: Boolean,
        event: Event,
        selectedDivisionId: String?,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
    ) {
        if (matchIds.isEmpty()) return
        val targetIds = matchIds.mapNotNull { id -> id.normalizedToken() }.toSet()
        if (targetIds.isEmpty()) return

        _editableMatches.value = _editableMatches.value.map { match ->
            if (targetIds.contains(match.match.id)) {
                match.copy(match = match.match.copy(locked = locked))
            } else {
                match
            }
        }
        refreshEditableRounds(event, selectedDivisionId, buildRounds)
    }

    fun showTeamSelection(matchId: String, position: TeamPosition, availableTeams: List<TeamWithPlayers>) {
        _showTeamSelectionDialog.value = TeamSelectionDialogState(
            matchId = matchId,
            position = position,
            availableTeams = availableTeams,
        )
    }

    fun selectTeamForMatch(
        matchId: String,
        position: TeamPosition,
        teamId: String?,
        event: Event,
        selectedDivisionId: String?,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
    ) {
        updateEditableMatch(
            matchId = matchId,
            event = event,
            selectedDivisionId = selectedDivisionId,
            buildRounds = buildRounds,
        ) { match ->
            when (position) {
                TeamPosition.TEAM1 -> match.copy(team1Id = teamId)
                TeamPosition.TEAM2 -> match.copy(team2Id = teamId)
                TeamPosition.OFFICIAL -> match.copy(teamOfficialId = teamId)
            }
        }
        _showTeamSelectionDialog.value = null
    }

    fun dismissTeamSelection() {
        _showTeamSelectionDialog.value = null
    }

    fun showMatchEditDialog(state: MatchEditDialogState) {
        _showMatchEditDialog.value = state
    }

    fun availableMatchesForDialog(fallbackMatches: List<MatchWithRelations>): List<MatchWithRelations> =
        if (_isEditingMatches.value) _editableMatches.value else fallbackMatches

    fun dismissMatchEditDialog(
        event: Event,
        selectedDivisionId: String?,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
    ) {
        val pendingId = pendingCreateMatchId
        if (!pendingId.isNullOrBlank()) {
            _editableMatches.value = _editableMatches.value.filterNot { relation ->
                relation.match.id == pendingId
            }
            _stagedMatchCreates.value = _stagedMatchCreates.value - pendingId
            refreshEditableRounds(event, selectedDivisionId, buildRounds)
            pendingCreateMatchId = null
        }
        _showMatchEditDialog.value = null
    }

    fun deleteMatchFromDialog(
        matchId: String,
        event: Event,
        selectedDivisionId: String?,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
    ) {
        val normalizedId = matchId.normalizedToken() ?: return
        if (!_editableMatches.value.any { relation -> relation.match.id == normalizedId }) {
            _showMatchEditDialog.value = null
            return
        }

        val isClient = isStagedClientMatchId(normalizedId)
        _editableMatches.value = _editableMatches.value
            .filterNot { relation -> relation.match.id == normalizedId }
            .map { relation ->
                val match = relation.match
                relation.copy(
                    match = match.copy(
                        winnerNextMatchId = if (match.winnerNextMatchId.normalizedToken() == normalizedId) null else match.winnerNextMatchId,
                        loserNextMatchId = if (match.loserNextMatchId.normalizedToken() == normalizedId) null else match.loserNextMatchId,
                        previousLeftId = if (match.previousLeftId.normalizedToken() == normalizedId) null else match.previousLeftId,
                        previousRightId = if (match.previousRightId.normalizedToken() == normalizedId) null else match.previousRightId,
                    ),
                )
            }
            .let(::normalizeEditableBracketGraph)
        _stagedMatchCreates.value = _stagedMatchCreates.value - normalizedId
        _stagedMatchDeletes.value = if (isClient) {
            _stagedMatchDeletes.value - normalizedId
        } else {
            _stagedMatchDeletes.value + normalizedId
        }
        if (pendingCreateMatchId == normalizedId) {
            pendingCreateMatchId = null
        }
        refreshEditableRounds(event, selectedDivisionId, buildRounds)
        _showMatchEditDialog.value = null
    }

    fun updateMatchFromDialog(
        updatedMatch: MatchWithRelations,
        event: Event,
        selectedDivisionId: String?,
        buildRounds: (Map<String, MatchWithRelations>) -> List<List<MatchWithRelations?>>,
    ) {
        val currentMatches = _editableMatches.value.toMutableList()
        val matchIndex = currentMatches.indexOfFirst { it.match.id == updatedMatch.match.id }
        if (matchIndex != -1) {
            currentMatches[matchIndex] = updatedMatch
        } else {
            currentMatches += updatedMatch
        }
        _editableMatches.value = normalizeEditableBracketGraph(currentMatches)
        if (isStagedClientMatchId(updatedMatch.match.id) && !_stagedMatchCreates.value.containsKey(updatedMatch.match.id)) {
            _stagedMatchCreates.value = _stagedMatchCreates.value + (
                updatedMatch.match.id to StagedMatchCreateMeta(
                    clientId = extractStagedClientId(updatedMatch.match.id),
                    creationContext = MatchCreateContext.BRACKET,
                    autoPlaceholderTeam = event.eventType == EventType.TOURNAMENT,
                )
                )
        }
        pendingCreateMatchId = null
        refreshEditableRounds(event, selectedDivisionId, buildRounds)
        _showMatchEditDialog.value = null
    }

    fun prepareCommit(isTournament: Boolean): MatchEditCommitPreparation {
        val matches = _editableMatches.value
        val stagedCreates = _stagedMatchCreates.value
        val validationResult = validateEditableMatches(
            matches = matches,
            isTournament = isTournament,
            stagedCreates = stagedCreates,
            isClientMatchId = ::isStagedClientMatchId,
        )
        if (!validationResult.isValid) {
            return MatchEditCommitPreparation.Invalid(validationResult.errorMessage)
        }

        val updates = matches
            .map { relation -> relation.match }
            .filterNot { match -> isStagedClientMatchId(match.id) }
        val creates = matches
            .mapNotNull { relation ->
                val match = relation.match
                if (!isStagedClientMatchId(match.id)) {
                    return@mapNotNull null
                }
                val meta = stagedCreates[match.id] ?: StagedMatchCreateMeta(
                    clientId = extractStagedClientId(match.id),
                    creationContext = MatchCreateContext.BRACKET,
                    autoPlaceholderTeam = isTournament,
                )
                StagedMatchCreate(
                    clientId = meta.clientId,
                    match = match,
                    creationContext = meta.creationContext.name.lowercase(),
                    autoPlaceholderTeam = meta.autoPlaceholderTeam,
                )
            }
        return MatchEditCommitPreparation.Valid(
            PreparedMatchBulkUpdate(
                updates = updates,
                creates = creates,
                deletes = _stagedMatchDeletes.value.toList(),
            ),
        )
    }

    private fun nextEditableMatchNumber(): Int {
        val maxMatchId = _editableMatches.value.maxOfOrNull { relation -> relation.match.matchId } ?: 0
        return maxMatchId + 1
    }

    private fun placeholderCount(): Int {
        return _editableMatches.value.count { relation ->
            val team1Id = relation.match.team1Id.normalizedToken()
            val team2Id = relation.match.team2Id.normalizedToken()
            (team1Id?.startsWith(LOCAL_PLACEHOLDER_PREFIX) == true) ||
                (team2Id?.startsWith(LOCAL_PLACEHOLDER_PREFIX) == true)
        }
    }
}

private fun relationFor(match: MatchMVP): MatchWithRelations =
    MatchWithRelations(
        match = match,
        field = null,
        team1 = null,
        team2 = null,
        teamOfficial = null,
        winnerNextMatch = null,
        loserNextMatch = null,
        previousLeftMatch = null,
        previousRightMatch = null,
    )

private fun MatchWithRelations.hasBracketLinks(): Boolean =
    previousRightMatch != null ||
        previousLeftMatch != null ||
        winnerNextMatch != null ||
        loserNextMatch != null

private fun String?.normalizedToken(): String? =
    this?.trim()?.takeIf(String::isNotBlank)

private fun stagedClientMatchId(clientId: String): String =
    "$CLIENT_MATCH_PREFIX$clientId"

private fun isStagedClientMatchId(value: String?): Boolean =
    value.normalizedToken()?.startsWith(CLIENT_MATCH_PREFIX) == true

private fun extractStagedClientId(matchId: String): String =
    matchId.removePrefix(CLIENT_MATCH_PREFIX)
