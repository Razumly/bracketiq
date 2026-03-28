@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.matchDetail

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.isUserAssignedToOfficialSlot
import com.razumly.mvp.core.data.dataTypes.isUserCheckedInForOfficialSlot
import com.razumly.mvp.core.data.dataTypes.updateOfficialAssignmentCheckIn
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.eventDetail.data.IMatchRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

interface MatchContentComponent {
    val matchWithTeams: StateFlow<MatchWithTeams>
    val event: StateFlow<Event?>
    val matchFinished: StateFlow<Boolean>
    val officialCheckedIn: StateFlow<Boolean>
    val currentSet: StateFlow<Int>
    val isOfficial: StateFlow<Boolean>
    val showOfficialCheckInDialog: StateFlow<Boolean>
    val showSetConfirmDialog: StateFlow<Boolean>
    val errorState: StateFlow<String?>

    fun dismissSetDialog()
    fun dismissOfficialDialog()
    fun checkOfficialStatus()
    fun confirmOfficialCheckIn()
    fun updateScore(isTeam1: Boolean, increment: Boolean)
    fun requestSetConfirmation()
    fun confirmSet()
}


@Serializable
data class MatchWithTeams(
    val match: MatchMVP,
    val field: Field?,
    val winnerNextMatch: MatchMVP?,
    val loserNextMatch: MatchMVP?,
    val previousLeftMatch: MatchMVP?,
    val previousRightMatch: MatchMVP?,
    val team1: TeamWithRelations?,
    val team2: TeamWithRelations?,
    val teamOfficial: TeamWithRelations?
)

fun MatchWithRelations.toMatchWithTeams(
    team1: TeamWithRelations?, team2: TeamWithRelations?, teamOfficial: TeamWithRelations?
) = MatchWithTeams(
    match = this.match,
    field = this.field,
    winnerNextMatch = this.winnerNextMatch,
    loserNextMatch = this.loserNextMatch,
    previousLeftMatch = this.previousLeftMatch,
    previousRightMatch = this.previousRightMatch,
    team1 = team1,
    team2 = team2,
    teamOfficial = teamOfficial
)

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultMatchContentComponent(
    componentContext: ComponentContext,
    selectedMatch: MatchWithRelations,
    selectedEvent: Event?,
    eventRepository: IEventRepository,
    private val matchRepository: IMatchRepository,
    userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
) : MatchContentComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    override val event =
        eventRepository.getEventWithRelationsFlow(selectedMatch.match.eventId)
            .distinctUntilChanged()
            .map { eventResult ->
                eventResult.map { it.event as Event }.getOrElse {
                    _errorState.value = it.message
                    selectedEvent
                }
            }.stateIn(scope, SharingStarted.Eagerly, selectedEvent)

    private val _optimisticMatch = MutableStateFlow<MatchWithTeams?>(null)

    override val matchWithTeams = _optimisticMatch.flatMapLatest { optimisticMatch ->
        if (optimisticMatch != null) {
            flowOf(optimisticMatch)
        } else {
            matchRepository.getMatchFlow(selectedMatch.match.id).distinctUntilChanged()
                .flatMapLatest { dbResult ->
                    val baseMatch = dbResult.getOrElse {
                        _errorState.value = it.message
                        selectedMatch
                    }

                    val team1Flow = baseMatch.match.team1Id?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    val team2Flow = baseMatch.match.team2Id?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    val teamOfficialFlow = baseMatch.match.teamOfficialId?.let {
                        teamRepository.getTeamWithPlayersFlow(it)
                    } ?: flowOf(Result.success(null))

                    combine(team1Flow, team2Flow, teamOfficialFlow) { team1Result, team2Result, teamOfficialResult ->
                        baseMatch.toMatchWithTeams(
                            team1 = team1Result.getOrNull(),
                            team2 = team2Result.getOrNull(),
                            teamOfficial = teamOfficialResult.getOrNull()
                        )
                    }
                }
        }
    }.stateIn(
        scope, SharingStarted.Eagerly, selectedMatch.toMatchWithTeams(null, null, null)
    )

    private val pendingUpdates = mutableListOf<MatchMVP>()
    private var isProcessingUpdates = false

    private val _matchFinished = MutableStateFlow(false)
    override val matchFinished = _matchFinished.asStateFlow()

    private val _officialCheckedIn = MutableStateFlow(selectedMatch.match.officialCheckedIn ?: false)
    override val officialCheckedIn: StateFlow<Boolean> = _officialCheckedIn.asStateFlow()

    private val _currentSet = MutableStateFlow(0)
    override val currentSet = _currentSet.asStateFlow()

    private val _isOfficial = MutableStateFlow(false)
    override val isOfficial = _isOfficial.asStateFlow()

    private val _showOfficialCheckInDialog = MutableStateFlow(false)
    override val showOfficialCheckInDialog = _showOfficialCheckInDialog.asStateFlow()

    private val _showSetConfirmDialog = MutableStateFlow(false)
    override val showSetConfirmDialog = _showSetConfirmDialog.asStateFlow()

    private val currentUserState = userRepository.currentUser
        .map { result -> result.getOrNull() ?: UserData() }
        .stateIn(scope, SharingStarted.Eagerly, UserData())
    private val currentUser: UserData
        get() = currentUserState.value

    private val _currentUserTeams = currentUserState
        .map { user -> user.id.trim() }
        .distinctUntilChanged()
        .flatMapLatest { currentUserId ->
            if (currentUserId.isBlank()) {
                flowOf(Result.success(emptyList()))
            } else {
                teamRepository.getTeamsWithPlayersFlow(currentUserId)
            }
        }.map { teamResults ->
            teamResults.getOrElse {
                _errorState.value = it.message
                emptyList()
            }
        }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    private var maxSets = 1

    private var setsNeeded = 1

    init {
        scope.launch {
            event.collect {
                val normalizedMatch = updateMatchStructureForCurrentContext(matchWithTeams.value.match)
                _matchFinished.value = isMatchOver(normalizedMatch)
                if (!_matchFinished.value) {
                    _currentSet.value = resolveCurrentSetIndex(normalizedMatch.setResults)
                }
                checkOfficialStatus()
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(selectedMatch.match)
            matchWithTeams.collect {
                val normalizedMatch = updateMatchStructureForCurrentContext(it.match)
                _matchFinished.value = isMatchOver(normalizedMatch)
                if (!_matchFinished.value) {
                    _currentSet.value = resolveCurrentSetIndex(normalizedMatch.setResults)
                }
                checkOfficialStatus()
            }
        }
        scope.launch {
            _currentUserTeams.collect {
                checkOfficialStatus()
            }
        }
    }

    override fun dismissSetDialog() {
        _showSetConfirmDialog.value = false
    }

    override fun dismissOfficialDialog() {
        _showOfficialCheckInDialog.value = false
    }

    override fun checkOfficialStatus() {
        val currentMatch = matchWithTeams.value.match
        val teamOfficialId = normalizeOptionalId(currentMatch.teamOfficialId)
        val teamIds = currentUserTeamIds().toSet()
        val isAssignedTeamOfficial = teamOfficialId != null && teamIds.contains(teamOfficialId)
        val isAssignedUserOfficial = currentMatch.isUserAssignedToOfficialSlot(currentUser.id)
        val checkedIn = when {
            isAssignedUserOfficial -> currentMatch.isUserCheckedInForOfficialSlot(currentUser.id)
            else -> currentMatch.officialCheckedIn == true
        }
        val canSwapIntoOfficial = !checkedIn && canCurrentUserSwapIntoOfficial(currentMatch)

        _isOfficial.value = isAssignedTeamOfficial || isAssignedUserOfficial
        _officialCheckedIn.value = checkedIn
        _showOfficialCheckInDialog.value = !checkedIn && (_isOfficial.value || canSwapIntoOfficial)
    }

    override fun confirmOfficialCheckIn() {
        scope.launch {
            val currentMatch = matchWithTeams.value.match
            val teamIds = currentUserTeamIds().toSet()
            val currentTeamOfficialId = normalizeOptionalId(currentMatch.teamOfficialId)
            val isAssignedTeamOfficial =
                currentTeamOfficialId != null && teamIds.contains(currentTeamOfficialId)
            val isAssignedUserOfficial = currentMatch.isUserAssignedToOfficialSlot(currentUser.id)
            val canSwap = canCurrentUserSwapIntoOfficial(currentMatch)
            val checkedIn = when {
                isAssignedUserOfficial -> currentMatch.isUserCheckedInForOfficialSlot(currentUser.id)
                else -> currentMatch.officialCheckedIn == true
            }

            if (checkedIn) {
                dismissOfficialDialog()
                _officialCheckedIn.value = true
                return@launch
            }

            if (!isAssignedTeamOfficial && !isAssignedUserOfficial && !canSwap) {
                dismissOfficialDialog()
                _errorState.value = "Only teams in this event can officiate this match."
                return@launch
            }

            if (isAssignedTeamOfficial || isAssignedUserOfficial) {
                val updatedMatch = matchWithTeams.value.copy(
                    match = if (isAssignedUserOfficial) {
                        currentMatch.updateOfficialAssignmentCheckIn(
                            userId = currentUser.id,
                            checkedIn = true,
                        )
                    } else {
                        currentMatch.copy(officialCheckedIn = true)
                    },
                )
                matchRepository.updateMatch(updatedMatch.match).onSuccess {
                    dismissOfficialDialog()
                    _officialCheckedIn.value = true
                    _isOfficial.value = true
                }.onFailure {
                    _errorState.value = it.message
                }
                return@launch
            }

            val currentUserEventTeamId = resolveCurrentUserEventTeamId(currentMatch)
            if (currentUserEventTeamId == null) {
                _errorState.value = "Only teams in this event can officiate this match."
                return@launch
            }

            val updatedMatch = matchWithTeams.value.copy(
                match = currentMatch.copy(
                    teamOfficialId = currentUserEventTeamId,
                    officialCheckedIn = false,
                ),
            )
            matchRepository.updateMatch(updatedMatch.match).onSuccess {
                _isOfficial.value = true
                _officialCheckedIn.value = false
                _showOfficialCheckInDialog.value = true
            }.onFailure {
                _errorState.value = it.message
            }
        }
    }

    private fun currentUserTeamIds(): List<String> {
        val repositoryTeamIds = _currentUserTeams.value
            .map { team -> team.team.id.trim() }
            .filter(String::isNotBlank)
        val profileTeamIds = currentUser.teamIds
            .map { teamId -> teamId.trim() }
            .filter(String::isNotBlank)
        return (repositoryTeamIds + profileTeamIds).distinct()
    }

    private fun resolveCurrentUserParticipatingTeamId(match: MatchMVP): String? {
        val participantTeamIds = setOfNotNull(
            normalizeOptionalId(match.team1Id),
            normalizeOptionalId(match.team2Id),
        )
        if (participantTeamIds.isEmpty()) {
            return null
        }
        return currentUserTeamIds().firstOrNull { teamId -> participantTeamIds.contains(teamId) }
    }

    private fun resolveCurrentUserEventTeamId(match: MatchMVP): String? {
        val userTeamIds = currentUserTeamIds()
        val eventTeamIds = event.value
            ?.teamIds
            ?.mapNotNull(::normalizeOptionalId)
            ?.toSet()
            .orEmpty()

        if (eventTeamIds.isNotEmpty()) {
            return userTeamIds.firstOrNull { teamId -> eventTeamIds.contains(teamId) }
        }

        // Fallback for stale event snapshots where teamIds may not yet be populated.
        return resolveCurrentUserParticipatingTeamId(match)
    }

    private fun canCurrentUserSwapIntoOfficial(match: MatchMVP): Boolean {
        if (event.value?.doTeamsOfficiate != true) {
            return false
        }
        if (event.value?.teamOfficialsMaySwap != true) {
            return false
        }
        if (match.officialCheckedIn == true) {
            return false
        }
        val eventTeamId = resolveCurrentUserEventTeamId(match) ?: return false
        return eventTeamId != normalizeOptionalId(match.teamOfficialId)
    }

    private fun normalizeOptionalId(rawId: String?): String? {
        val normalized = rawId?.trim()
        return normalized?.takeIf(String::isNotBlank)
    }

    override fun updateScore(isTeam1: Boolean, increment: Boolean) {
        if (!isOfficial.value || officialCheckedIn.value != true || matchFinished.value) {
            return
        }

        val currentMatch = matchWithTeams.value
        val scoringMatch = updateMatchStructureForCurrentContext(currentMatch.match)
        val setIndex = currentSet.value.coerceIn(0, maxSets - 1)

        if (increment && checkSetCompletion(scoringMatch)) {
            return
        }

        val currentPoints = if (isTeam1) {
            scoringMatch.team1Points.toMutableList()
        } else {
            scoringMatch.team2Points.toMutableList()
        }

        if (increment) {
            currentPoints[setIndex]++
        } else if (!increment && currentPoints[setIndex] > 0) {
            currentPoints[setIndex]--
        }

        val updatedScoringMatch = if (isTeam1) {
            scoringMatch.copy(team1Points = currentPoints)
        } else {
            scoringMatch.copy(team2Points = currentPoints)
        }
        val optimisticMatch = currentMatch.copy(match = updatedScoringMatch)

        _optimisticMatch.value = optimisticMatch

        if (checkSetCompletion(updatedScoringMatch)) {
            syncMatchImmediately(updatedScoringMatch)
        } else {
            queueDatabaseUpdate(updatedScoringMatch)
        }
    }


    override fun requestSetConfirmation() {
        if (matchFinished.value || !isOfficial.value || officialCheckedIn.value != true) return

        val scoringMatch = updateMatchStructureForCurrentContext(matchWithTeams.value.match)
        val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
        val team1Score = scoringMatch.team1Points.getOrElse(setIndex) { 0 }
        val team2Score = scoringMatch.team2Points.getOrElse(setIndex) { 0 }

        if (team1Score == team2Score) {
            _errorState.value = "Set score cannot be tied."
            return
        }

        _showSetConfirmDialog.value = true
    }


    override fun confirmSet() {
        if (matchFinished.value || !isOfficial.value || officialCheckedIn.value != true) {
            _showSetConfirmDialog.value = false
            return
        }
        _showSetConfirmDialog.value = false

        scope.launch {
            val currentMatch = matchWithTeams.value
            val scoringMatch = updateMatchStructureForCurrentContext(currentMatch.match)
            val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
            val team1Score = scoringMatch.team1Points.getOrElse(setIndex) { 0 }
            val team2Score = scoringMatch.team2Points.getOrElse(setIndex) { 0 }

            if (team1Score == team2Score) {
                _errorState.value = "Set score cannot be tied."
                return@launch
            }

            val setResults = scoringMatch.setResults.toMutableList()
            val team1Won = team1Score > team2Score

            setResults[setIndex] = if (team1Won) 1 else 2

            val updatedScoringMatch = scoringMatch.copy(setResults = setResults)

            val updatedMatch = currentMatch.copy(
                match = updatedScoringMatch
            )

            _optimisticMatch.value = updatedMatch

            if (isMatchOver(updatedScoringMatch)) {
                _matchFinished.value = true
                val endTime = updatedScoringMatch.end ?: updatedScoringMatch.start ?: Clock.System.now()
                // For match completion, sync everything immediately
                matchRepository.updateMatchFinished(updatedScoringMatch, endTime).onSuccess {
                    _optimisticMatch.value = null // Clear optimistic state
                }.onFailure { error ->
                    _errorState.value = "Failed to finish match: ${error.message}"
                }
            } else {
                if (currentSet.value + 1 < maxSets) {
                    _currentSet.value++
                }

                syncMatchImmediately(updatedScoringMatch)
            }
        }
    }


    private fun queueDatabaseUpdate(match: MatchMVP) {
        pendingUpdates.add(match)
        scope.launch {
            delay(500)
            processPendingUpdates()
        }
    }

    private suspend fun processPendingUpdates() {
        if (isProcessingUpdates || pendingUpdates.isEmpty()) return

        isProcessingUpdates = true

        try {
            // Get the latest update (most recent state)
            val latestUpdate = pendingUpdates.lastOrNull()
            pendingUpdates.clear()

            latestUpdate?.let { match ->
                matchRepository.updateMatch(match).onFailure { error ->
                    _errorState.value = "Failed to update score: ${error.message}"
                    // Revert optimistic update on failure
                    _optimisticMatch.value = null
                }
            }
        } finally {
            isProcessingUpdates = false
        }
    }

    private fun syncMatchImmediately(match: MatchMVP) {
        scope.launch {
            // Clear any pending updates since we're syncing now
            pendingUpdates.clear()

            matchRepository.updateMatch(match).onSuccess {
                // Clear optimistic state since database is now up to date
                _optimisticMatch.value = null
            }.onFailure { error ->
                _errorState.value = "Failed to sync match: ${error.message}"
                // Keep optimistic state on failure
            }
        }
    }

    private fun isMatchOver(match: MatchMVP): Boolean {
        val relevantResults = match.setResults.take(maxSets.coerceAtLeast(1))
        val team1Wins = relevantResults.count { it == 1 }
        val team2Wins = relevantResults.count { it == 2 }
        return team1Wins >= setsNeeded || team2Wins >= setsNeeded
    }

    private fun checkSetCompletion(match: MatchMVP): Boolean {
        if (event.value?.usesSets == false) return false

        val setIndex = currentSet.value.coerceIn(0, maxSets - 1)
        val team1Score = match.team1Points.getOrElse(setIndex) { 0 }
        val team2Score = match.team2Points.getOrElse(setIndex) { 0 }

        if (team1Score == team2Score || matchFinished.value) return false

        val isTeam1Leader = team1Score > team2Score
        val leaderScore = if (isTeam1Leader) team1Score else team2Score
        val followerScore = if (isTeam1Leader) team2Score else team1Score

        val pointsToVictory = resolvePointsToVictory(match, setIndex) ?: return false

        val winBy2 = leaderScore - followerScore >= 2 && leaderScore >= pointsToVictory

        if (winBy2) {
            _showSetConfirmDialog.value = true
            return true
        }

        return false
    }

    private fun updateMatchStructureForCurrentContext(match: MatchMVP): MatchMVP {
        maxSets = resolveExpectedSetCount(match)
        setsNeeded = ((maxSets + 1) / 2).coerceAtLeast(1)
        return normalizeMatchForSetCount(match, maxSets)
    }

    private fun resolveExpectedSetCount(match: MatchMVP): Int {
        val fallbackSetCount = listOf(
            match.setResults.size,
            match.team1Points.size,
            match.team2Points.size,
            1,
        ).maxOrNull() ?: 1

        val currentEvent = event.value ?: return fallbackSetCount
        if (!currentEvent.usesSets) {
            return 1
        }

        val isBracketMatch = isBracketMatch(match)
        return when {
            match.losersBracket -> currentEvent.loserSetCount.coerceAtLeast(1)
            currentEvent.eventType == EventType.LEAGUE && !isBracketMatch -> {
                (currentEvent.setsPerMatch ?: fallbackSetCount).coerceAtLeast(1)
            }
            else -> currentEvent.winnerSetCount.coerceAtLeast(1)
        }
    }

    private fun isBracketMatch(match: MatchMVP): Boolean {
        return match.losersBracket ||
            !match.previousLeftId.isNullOrBlank() ||
            !match.previousRightId.isNullOrBlank() ||
            !match.winnerNextMatchId.isNullOrBlank() ||
            !match.loserNextMatchId.isNullOrBlank()
    }

    private fun normalizeMatchForSetCount(match: MatchMVP, setCount: Int): MatchMVP {
        val normalizedTeam1 = normalizeScoreList(match.team1Points, setCount)
        val normalizedTeam2 = normalizeScoreList(match.team2Points, setCount)
        val normalizedResults = normalizeResultList(match.setResults, setCount)

        if (
            normalizedTeam1 == match.team1Points &&
            normalizedTeam2 == match.team2Points &&
            normalizedResults == match.setResults
        ) {
            return match
        }

        return match.copy(
            team1Points = normalizedTeam1,
            team2Points = normalizedTeam2,
            setResults = normalizedResults,
        )
    }

    private fun normalizeScoreList(values: List<Int>, setCount: Int): List<Int> {
        val normalized = values.take(setCount).toMutableList()
        while (normalized.size < setCount) {
            normalized.add(0)
        }
        return normalized
    }

    private fun normalizeResultList(values: List<Int>, setCount: Int): List<Int> {
        val normalized = values
            .take(setCount)
            .map { value -> if (value == 1 || value == 2) value else 0 }
            .toMutableList()
        while (normalized.size < setCount) {
            normalized.add(0)
        }
        return normalized
    }

    private fun resolveCurrentSetIndex(setResults: List<Int>): Int {
        val firstIncomplete = setResults.indexOfFirst { result -> result == 0 }
        return when {
            firstIncomplete >= 0 -> firstIncomplete
            setResults.isEmpty() -> 0
            else -> setResults.lastIndex.coerceAtLeast(0)
        }
    }

    private fun resolvePointsToVictory(match: MatchMVP, setIndex: Int): Int? {
        val currentEvent = event.value ?: return null
        if (!currentEvent.usesSets) return null

        val points = when {
            currentEvent.eventType == EventType.LEAGUE && !isBracketMatch(match) ->
                currentEvent.pointsToVictory.getOrNull(setIndex)
            match.losersBracket ->
                currentEvent.loserBracketPointsToVictory.getOrNull(setIndex)
            else ->
                currentEvent.winnerBracketPointsToVictory.getOrNull(setIndex)
        }
        return points?.takeIf { it > 0 }
    }
}
