package com.razumly.mvp.matchDetailScreen

import com.arkivanov.decompose.ComponentContext
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.ITournamentRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.eventDetailScreen.data.IMatchRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
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
import kotlin.math.ceil

interface MatchContentComponent {
    val matchWithTeams: StateFlow<MatchWithTeams>
    val tournament: StateFlow<Tournament?>
    val matchFinished: StateFlow<Boolean>
    val refCheckedIn: StateFlow<Boolean>
    val currentSet: StateFlow<Int>
    val isRef: StateFlow<Boolean>
    val showRefCheckInDialog: StateFlow<Boolean>
    val showSetConfirmDialog: StateFlow<Boolean>
    val errorState: StateFlow<String?>

    fun dismissSetDialog()
    fun dismissRefDialog()
    fun checkRefStatus()
    fun confirmRefCheckIn()
    fun updateScore(isTeam1: Boolean, increment: Boolean)
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
    val ref: TeamWithRelations?
)

fun MatchWithRelations.toMatchWithTeams(
    team1: TeamWithRelations?, team2: TeamWithRelations?, ref: TeamWithRelations?
) = MatchWithTeams(
    match = this.match,
    field = this.field,
    winnerNextMatch = this.winnerNextMatch,
    loserNextMatch = this.loserNextMatch,
    previousLeftMatch = this.previousLeftMatch,
    previousRightMatch = this.previousRightMatch,
    team1 = team1,
    team2 = team2,
    ref = ref
)

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultMatchContentComponent(
    componentContext: ComponentContext,
    selectedMatch: MatchWithRelations,
    selectedTournament: Tournament?,
    private val tournamentRepository: ITournamentRepository,
    private val matchRepository: IMatchRepository,
    private val userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
) : MatchContentComponent, ComponentContext by componentContext {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private val _errorState = MutableStateFlow<String?>(null)
    override val errorState = _errorState.asStateFlow()

    override val tournament =
        tournamentRepository.getTournamentFlow(selectedMatch.match.tournamentId)
            .distinctUntilChanged().map { tournament ->
                tournament.getOrElse {
                    _errorState.value = it.message
                    selectedTournament
                }
            }.stateIn(scope, SharingStarted.Eagerly, selectedTournament)

    override val matchWithTeams =
        matchRepository.getMatchFlow(selectedMatch.match.id).distinctUntilChanged()
            .flatMapLatest { result ->
                val matchWithRelations = result.getOrElse {
                    _errorState.value = it.message
                    selectedMatch
                }
                combine(matchWithRelations.match.team1?.let {
                    teamRepository.getTeamWithPlayersFlow(
                        it
                    )
                } ?: flowOf(Result.success(null)), matchWithRelations.match.team2?.let {
                    teamRepository.getTeamWithPlayersFlow(it)
                } ?: flowOf(Result.success(null)), matchWithRelations.match.refId?.let {
                    teamRepository.getTeamWithPlayersFlow(it)
                } ?: flowOf(Result.success(null))) { team1Result, team2Result, refResult ->
                    matchWithRelations.toMatchWithTeams(
                        team1 = team1Result.getOrElse {
                            _errorState.value = "Failed to load team1: ${it.message}"
                            null
                        },
                        team2 = team2Result.getOrElse {
                            _errorState.value = "Failed to load team2: ${it.message}"
                            null
                        },
                        ref = refResult.getOrElse {
                            _errorState.value = "Failed to load ref team: ${it.message}"
                            null
                        },
                    )
                }
            }.stateIn(
                scope, SharingStarted.Eagerly, MatchWithTeams(
                    selectedMatch.match, null, null, null, null, null, null, null, null
                )
            )

    private val _matchFinished = MutableStateFlow(false)
    override val matchFinished = _matchFinished.asStateFlow()

    private val _refCheckedIn = MutableStateFlow(selectedMatch.match.refCheckedIn ?: false)
    override val refCheckedIn: StateFlow<Boolean> = _refCheckedIn.asStateFlow()

    private val _currentSet = MutableStateFlow(0)
    override val currentSet = _currentSet.asStateFlow()

    private val _isRef = MutableStateFlow(false)
    override val isRef = _isRef.asStateFlow()

    private val _showRefCheckInDialog = MutableStateFlow(false)
    override val showRefCheckInDialog = _showRefCheckInDialog.asStateFlow()

    private val _showSetConfirmDialog = MutableStateFlow(false)
    override val showSetConfirmDialog = _showSetConfirmDialog.asStateFlow()

    private val _currentUser = userRepository.currentUserFlow

    @OptIn(ExperimentalCoroutinesApi::class)
    private val _currentUserTeam =
        _currentUser.map { user -> user?.teamIds ?: emptyList() }.flatMapLatest { teamIds ->
                teamRepository.getTeamsWithPlayersFlow(teamIds).map { teamResults ->
                    teamResults.getOrElse {
                        _errorState.value = it.message
                        emptyList()
                    }.find { team ->
                        tournament.value?.id != null && team.team.tournamentIds.contains(tournament.value?.id)
                    }
                }
            }.stateIn(scope, SharingStarted.Eagerly, null)

    private var maxSets = 0

    private var setsNeeded = 0

    init {
        scope.launch {
            tournament.collect { tournament ->
                tournament?.let { t ->
                    maxSets = if (matchWithTeams.value.match.losersBracket) {
                        t.loserSetCount
                    } else {
                        t.winnerSetCount
                    }
                    setsNeeded = ceil((maxSets.toDouble()) / 2).toInt()
                }
            }
        }
        scope.launch {
            matchRepository.setIgnoreMatch(selectedMatch.match)
            _currentUser.collect {
                checkRefStatus()
            }
        }
    }

    override fun dismissSetDialog() {
        _showSetConfirmDialog.value = false
    }

    override fun dismissRefDialog() {
        _showRefCheckInDialog.value = false
    }

    override fun checkRefStatus() {
        _isRef.value = _currentUser.value?.teamIds
            ?.contains(matchWithTeams.value.ref?.team?.id) == true
        _showRefCheckInDialog.value = refCheckedIn.value != true
    }

    override fun confirmRefCheckIn() {
        scope.launch {
            val updatedMatch = matchWithTeams.value.copy(
                match = matchWithTeams.value.match.copy(
                    refCheckedIn = true, refId = _currentUserTeam.value?.team?.id
                ),
            )
            _refCheckedIn.value = true
            _isRef.value = true
            matchRepository.updateMatch(updatedMatch.match).onSuccess {
                dismissRefDialog()
            }.onFailure {
                _errorState.value = it.message
            }
        }
    }

    override fun updateScore(isTeam1: Boolean, increment: Boolean) {
        if (!refCheckedIn.value) return

        scope.launch {
            val currentPoints = if (isTeam1) {
                matchWithTeams.value.match.team1Points.toMutableList()
            } else {
                matchWithTeams.value.match.team2Points.toMutableList()
            }

            val pointLimit = if (matchWithTeams.value.match.losersBracket) {
                tournament.value?.loserScoreLimitsPerSet?.get(currentSet.value)
            } else {
                tournament.value?.winnerScoreLimitsPerSet?.get(currentSet.value)
            }

            if (increment && currentPoints[currentSet.value] < pointLimit!!) {
                currentPoints[currentSet.value]++
            } else if (!increment && currentPoints[currentSet.value] > 0) {
                currentPoints[currentSet.value]--
            }

            val updatedMatch = if (isTeam1) {
                matchWithTeams.value.copy(match = matchWithTeams.value.match.copy(team1Points = currentPoints))
            } else {
                matchWithTeams.value.copy(match = matchWithTeams.value.match.copy(team2Points = currentPoints))
            }

            checkSetCompletion(updatedMatch.match)
            matchRepository.updateMatch(updatedMatch.match)
        }
    }

    override fun confirmSet() {
        _showSetConfirmDialog.value = false

        scope.launch {
            val setResults = matchWithTeams.value.match.setResults.toMutableList()
            val team1Won =
                matchWithTeams.value.match.team1Points[currentSet.value] > matchWithTeams.value.match.team2Points[currentSet.value]
            setResults[currentSet.value] = if (team1Won) 1 else 2

            val updatedMatch = matchWithTeams.value.copy(
                match = matchWithTeams.value.match.copy(setResults = setResults)
            )

            if (isMatchOver(updatedMatch.match)) {
                _matchFinished.value = true
                updatedMatch.match.end?.let {
                    matchRepository.updateMatchFinished(
                        updatedMatch.match, it
                    )
                }
            }

            if (currentSet.value + 1 < maxSets) {
                _currentSet.value++
            }
            matchRepository.updateMatch(updatedMatch.match)
        }
    }

    private fun isMatchOver(match: MatchMVP): Boolean {
        val team1Wins = match.setResults.count { it == 1 }
        val team2Wins = match.setResults.count { it == 2 }
        return team1Wins >= setsNeeded || team2Wins >= setsNeeded
    }

    private fun checkSetCompletion(match: MatchMVP) {
        val team1Score = match.team1Points[currentSet.value]
        val team2Score = match.team2Points[currentSet.value]
        if (team1Score == team2Score || matchFinished.value) return

        val isTeam1Leader = team1Score > team2Score
        val leaderScore: Int
        val followerScore: Int
        if (isTeam1Leader) {
            leaderScore = team1Score
            followerScore = team2Score
        } else {
            leaderScore = team2Score
            followerScore = team1Score
        }

        val pointLimit = if (match.losersBracket) {
            tournament.value?.loserScoreLimitsPerSet?.get(currentSet.value)
        } else {
            tournament.value?.winnerScoreLimitsPerSet?.get(currentSet.value)
        }

        val pointsToVictory = if (match.losersBracket) {
            tournament.value?.loserBracketPointsToVictory?.get(currentSet.value)
        } else {
            tournament.value?.winnerBracketPointsToVictory?.get(currentSet.value)
        }
        val winBy2 = leaderScore - followerScore >= 2 && leaderScore >= pointsToVictory!!
        val winByLimit = leaderScore >= pointLimit!!

        if (winBy2 || winByLimit) {
            _showSetConfirmDialog.value = true
        }
    }
}