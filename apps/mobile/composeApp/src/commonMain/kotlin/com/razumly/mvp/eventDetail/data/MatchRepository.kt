package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.network.MvpApiClient
import com.razumly.mvp.core.network.dto.MatchResponseDto
import com.razumly.mvp.core.network.dto.MatchUpdateDto
import com.razumly.mvp.core.network.dto.MatchesResponseDto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

@OptIn(ExperimentalTime::class)
interface IMatchRepository : IMVPRepository {
    suspend fun getMatch(matchId: String): Result<MatchMVP>
    fun getMatchFlow(matchId: String): Flow<Result<MatchWithRelations>>
    suspend fun updateMatch(match: MatchMVP): Result<Unit>
    fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>>
    suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit>
    suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>>
    suspend fun subscribeToMatches(): Result<Unit>
    suspend fun unsubscribeFromRealtime(): Result<Unit>
    fun setIgnoreMatch(match: MatchMVP?): Result<Unit>
}

@OptIn(ExperimentalTime::class)
class MatchRepository(
    private val api: MvpApiClient,
    private val databaseService: DatabaseService,
) : IMatchRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var _ignoreMatch = MutableStateFlow<MatchMVP?>(null)

    override suspend fun getMatch(matchId: String): Result<MatchMVP> =
        singleResponse(
            networkCall = {
                val local = databaseService.getMatchDao.getMatchById(matchId)?.match
                    ?: error("Match $matchId not cached; fetch matches for the event first")

                val res = api.get<MatchesResponseDto>("api/events/${local.eventId}/matches")
                res.matches.firstOrNull { (it.id ?: it.legacyId) == matchId }?.toMatchOrNull()
                    ?: error("Match $matchId not found")
            },
            saveCall = { match -> databaseService.getMatchDao.upsertMatch(match) },
            onReturn = { it },
        )

    override fun getMatchFlow(matchId: String): Flow<Result<MatchWithRelations>> {
        val localFlow =
            databaseService.getMatchDao.getMatchFlowById(matchId).map { Result.success(it) }
        scope.launch {
            getMatch(matchId)
        }
        return localFlow
    }

    override suspend fun updateMatch(match: MatchMVP): Result<Unit> = singleResponse(
        networkCall = {
            api.patch<MatchUpdateDto, MatchResponseDto>(
                path = "api/events/${match.eventId}/matches/${match.id}",
                body = MatchUpdateDto(
                    team1Points = match.team1Points,
                    team2Points = match.team2Points,
                    setResults = match.setResults,
                    team1Id = match.team1Id,
                    team2Id = match.team2Id,
                    refereeId = match.refereeId,
                    teamRefereeId = match.teamRefereeId,
                    fieldId = match.fieldId,
                    previousLeftId = match.previousLeftId,
                    previousRightId = match.previousRightId,
                    winnerNextMatchId = match.winnerNextMatchId,
                    loserNextMatchId = match.loserNextMatchId,
                    side = match.side,
                    refereeCheckedIn = match.refereeCheckedIn,
                    matchId = match.matchId,
                ),
            ).match?.toMatchOrNull() ?: error("Update match response missing match")
        },
        saveCall = { updatedMatch -> databaseService.getMatchDao.upsertMatch(updatedMatch) },
        onReturn = {},
    )

    override fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getMatchDao.getMatchesFlowOfTournament(tournamentId)
                    .collect { trySend(Result.success(it)) }
            }

            val remoteJob = launch {
                multiResponse(getRemoteData = {
                    api.get<MatchesResponseDto>("api/events/$tournamentId/matches")
                        .matches.mapNotNull { it.toMatchOrNull() }
                },
                    getLocalData = {
                        databaseService.getMatchDao.getMatchesOfTournament(tournamentId)
                    },
                    saveData = { matches ->
                        databaseService.getMatchDao.upsertMatches(matches)
                    },
                    deleteData = { databaseService.getMatchDao.deleteMatchesById(it) }).onFailure { error ->
                    trySend(Result.failure(error))
                }
            }

            awaitClose {
                localJob.cancel()
                remoteJob.cancel()
            }
        }

    override suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit> =
        singleResponse(
            networkCall = {
                api.patch<MatchUpdateDto, MatchResponseDto>(
                    path = "api/events/${match.eventId}/matches/${match.id}",
                    body = MatchUpdateDto(
                        team1Points = match.team1Points,
                        team2Points = match.team2Points,
                        setResults = match.setResults,
                        team1Id = match.team1Id,
                        team2Id = match.team2Id,
                        refereeId = match.refereeId,
                        teamRefereeId = match.teamRefereeId,
                        fieldId = match.fieldId,
                        previousLeftId = match.previousLeftId,
                        previousRightId = match.previousRightId,
                        winnerNextMatchId = match.winnerNextMatchId,
                        loserNextMatchId = match.loserNextMatchId,
                        side = match.side,
                        refereeCheckedIn = match.refereeCheckedIn,
                        matchId = match.matchId,
                        finalize = true,
                        time = time.toString(),
                    ),
                ).match?.toMatchOrNull() ?: error("Finalize match response missing match")
            },
            saveCall = { updated -> databaseService.getMatchDao.upsertMatch(updated) },
            onReturn = {},
        )

    override suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>> =
        multiResponse(getRemoteData = {
            api.get<MatchesResponseDto>("api/events/$tournamentId/matches")
                .matches.mapNotNull { it.toMatchOrNull() }
        }, getLocalData = {
            databaseService.getMatchDao.getMatchesOfTournament(tournamentId)
        }, saveData = { matches ->
            databaseService.getMatchDao.upsertMatches(matches)
        }, deleteData = { databaseService.getMatchDao.deleteMatchesById(it) })

    override suspend fun subscribeToMatches(): Result<Unit> {
        return Result.success(Unit)
    }

    override suspend fun unsubscribeFromRealtime(): Result<Unit> =
        Result.success(Unit)

    override fun setIgnoreMatch(match: MatchMVP?) = runCatching { _ignoreMatch.value = match }
}
