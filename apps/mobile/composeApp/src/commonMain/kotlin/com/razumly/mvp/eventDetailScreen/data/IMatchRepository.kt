package com.razumly.mvp.eventDetailScreen.data

import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.Instant

interface IMatchRepository {
    suspend fun getMatch(matchId: String): Result<MatchMVP>
    suspend fun updateMatch(match: MatchMVP): Result<Unit>
    suspend fun getMatchesFlow(tournamentId: String): Flow<Result<Map<String, MatchWithRelations>>>
    suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit>
    suspend fun getMatchesOfTournament(tournamentId: String): Result<MatchWithRelations>
}