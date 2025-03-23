package com.razumly.mvp.eventDetailScreen.data

import com.razumly.mvp.core.data.MVPDatabase
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.FieldMatchCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.MatchTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toMatch
import com.razumly.mvp.core.data.dataTypes.toMatchDTO
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.DbConstants.MATCHES_CHANNEL
import com.razumly.mvp.core.util.convert
import io.appwrite.Query
import io.appwrite.models.RealtimeSubscription
import io.appwrite.services.Databases
import io.appwrite.services.Realtime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.datetime.Instant

class MatchRepository(
    private val database: Databases,
    private val mvpDatabase: MVPDatabase,
    private val realtime: Realtime
) : IMatchRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var matchSubscription: RealtimeSubscription? = null
    private var _ignoreMatch = MutableStateFlow<MatchMVP?>(null)

    override suspend fun getMatch(matchId: String): Result<MatchMVP> =
        singleResponse(networkCall = {
            database.getDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.MATCHES_COLLECTION,
                documentId = matchId,
                nestedType = MatchDTO::class
            ).data.toMatch(matchId)
        }, saveCall = { match ->
            mvpDatabase.getMatchDao.upsertMatch(match)
        }, onReturn = { it })

    override suspend fun updateMatch(match: MatchMVP): Result<Unit> =
        singleResponse(networkCall = {
            database.updateDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.MATCHES_COLLECTION,
                documentId = match.id,
                data = match.toMatchDTO(),
                nestedType = MatchDTO::class
            ).data.toMatch(match.id)
        }, saveCall = { updatedMatch ->
            mvpDatabase.getMatchDao.upsertMatch(updatedMatch)
        }, onReturn = { })

    override suspend fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>> {
        val localMatchesFlow = mvpDatabase.getMatchDao.getMatchesFlowOfTournament(tournamentId)
            .map { Result.success(it) }

        scope.launch {
            multiResponse(getRemoteData = {
                database.listDocuments(
                    DbConstants.DATABASE_NAME, DbConstants.MATCHES_COLLECTION, queries = listOf(
                        Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId),
                        Query.limit(200)
                    ), nestedType = MatchDTO::class
                ).documents.map { dtoDoc ->
                    dtoDoc.convert { it.toMatch(dtoDoc.id) }.data
                }
            }, getLocalData = {
                mvpDatabase.getMatchDao.getMatchesOfTournament(tournamentId)
            }, saveData = { matches ->
                mvpDatabase.getMatchDao.upsertMatches(matches)
            })
        }

        return localMatchesFlow
    }

    override suspend fun updateMatchFinished(match: MatchMVP, time: Instant): Result<Unit> {
        val updatedMatch = match.copy(end = time)

        return updateMatch(updatedMatch)
    }

    override suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>> =
        multiResponse(getRemoteData = {
            database.listDocuments(
                DbConstants.DATABASE_NAME, DbConstants.MATCHES_COLLECTION, queries = listOf(
                    Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId), Query.limit(200)
                ), nestedType = MatchDTO::class
            ).documents.map { dtoDoc ->
                dtoDoc.convert { it.toMatch(dtoDoc.id) }.data
            }
        }, getLocalData = {
            mvpDatabase.getMatchDao.getMatchesOfTournament(tournamentId)
        }, saveData = { matches ->
            mvpDatabase.getMatchDao.upsertMatches(matches)
            mvpDatabase.getMatchDao.upsertMatchTeamCrossRefs(matches.flatMap { match ->
                val crossRefs = mutableListOf<MatchTeamCrossRef>()
                match.team1?.let { crossRefs.add(MatchTeamCrossRef(it, match.id)) }
                match.team2?.let { crossRefs.add(MatchTeamCrossRef(it, match.id)) }
                crossRefs
            })
            mvpDatabase.getMatchDao.upsertFieldMatchCrossRefs(matches.mapNotNull { match ->
                match.field?.let { FieldMatchCrossRef(match.field, match.id) }
            })
        })

    override suspend fun subscribeToMatches(): Result<Unit> {
        matchSubscription?.close()
        val channels = listOf(MATCHES_CHANNEL)
        matchSubscription = realtime.subscribe(
            channels, payloadType = MatchDTO::class
        ) { response ->
            val matchUpdates = response.payload
            scope.launch(Dispatchers.IO) {
                val id = response.channels.last().split(".").last()
                val dbMatch = mvpDatabase.getMatchDao.getMatchById(id)
                if (dbMatch?.match?.id == _ignoreMatch.value?.id) {
                    return@launch
                }
                dbMatch?.let { match ->
                    val updatedMatch = match.copy(
                        match = match.match.copy(team1Points = matchUpdates.team1Points,
                            team2Points = matchUpdates.team2Points,
                            field = matchUpdates.field,
                            refId = matchUpdates.refId,
                            team1 = matchUpdates.team1,
                            team2 = matchUpdates.team2,
                            refCheckedIn = matchUpdates.refereeCheckedIn,
                            start = Instant.parse(matchUpdates.start),
                            end = matchUpdates.end?.let { Instant.parse(it) })
                    )
                    mvpDatabase.getMatchDao.upsertMatch(updatedMatch.match)
                }
            }
        }
        return Result.success(Unit)
    }

    override suspend fun unsubscribeFromRealtime(): Result<Unit> = 
        runCatching { matchSubscription?.close() }

    override fun setIgnoreMatch(match: MatchMVP?) =
        runCatching{ _ignoreMatch.value = match }
}
