package com.razumly.mvp.eventDetail.data

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toMatch
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.DbConstants.MATCHES_CHANNEL
import com.razumly.mvp.core.util.convert
import io.appwrite.Query
import io.appwrite.models.RealtimeSubscription
import io.appwrite.services.TablesDB
import io.appwrite.services.Functions
import io.appwrite.services.Realtime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.serialization.Contextual
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.Clock
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
    private val tablesDb: TablesDB,
    private val databaseService: DatabaseService,
    private val realtime: Realtime,
    private val functions: Functions,
) : IMatchRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var matchSubscription: RealtimeSubscription? = null
    private var _ignoreMatch = MutableStateFlow<MatchMVP?>(null)

    override suspend fun getMatch(matchId: String): Result<MatchMVP> =
        singleResponse(networkCall = {
            tablesDb.getRow<MatchDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.MATCHES_TABLE,
                rowId = matchId,
                nestedType = MatchDTO::class
            ).data.toMatch(matchId)
        }, saveCall = { match ->
            databaseService.getMatchDao.upsertMatch(match)
        }, onReturn = { it })

    override fun getMatchFlow(matchId: String): Flow<Result<MatchWithRelations>> {
        val localFlow =
            databaseService.getMatchDao.getMatchFlowById(matchId).map { Result.success(it) }
        scope.launch {
            getMatch(matchId)
        }
        return localFlow
    }

    override suspend fun updateMatch(match: MatchMVP): Result<Unit> = singleResponse(networkCall = {
        tablesDb.updateRow<MatchDTO>(
            databaseId = DbConstants.DATABASE_NAME,
            tableId = DbConstants.MATCHES_TABLE,
            rowId = match.id,
            data = match.toMatchDTO(),
            nestedType = MatchDTO::class
        ).data.toMatch(match.id)
    }, saveCall = { updatedMatch ->
        databaseService.getMatchDao.upsertMatch(updatedMatch)
    }, onReturn = {})

    override fun getMatchesOfTournamentFlow(tournamentId: String): Flow<Result<List<MatchWithRelations>>> =
        callbackFlow {
            val localJob = launch {
                databaseService.getMatchDao.getMatchesFlowOfTournament(tournamentId)
                    .collect { trySend(Result.success(it)) }
            }

            val remoteJob = launch {
                multiResponse(getRemoteData = {
                    tablesDb.listRows<MatchDTO>(
                        databaseId = DbConstants.DATABASE_NAME,
                        tableId = DbConstants.MATCHES_TABLE,
                        queries = listOf(
                            Query.equal(DbConstants.EVENT_ID_ATTRIBUTE, tournamentId),
                            Query.limit(200)
                        ),
                        nestedType = MatchDTO::class
                    ).rows.map { dtoRow ->
                        dtoRow.convert { it.toMatch(dtoRow.id) }.data
                    }
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
        runCatching {
            val updatedMatch = match.copy(end = time)

            return updateMatch(updatedMatch).onSuccess {
                functions.createExecution(
                    functionId = DbConstants.EVENT_MANAGER_FUNCTION,
                    body = Json.encodeToString(
                        UpdateMatchArguments(
                            time = Clock.System.now(),
                            tournament = match.tournamentId,
                            matchId = match.id
                        )
                    ),
                    async = false,
                )
            }
        }

    override suspend fun getMatchesOfTournament(tournamentId: String): Result<List<MatchMVP>> =
        multiResponse(getRemoteData = {
            tablesDb.listRows<MatchDTO>(
                databaseId = DbConstants.DATABASE_NAME,
                tableId = DbConstants.MATCHES_TABLE,
                queries = listOf(
                    Query.equal(DbConstants.EVENT_ID_ATTRIBUTE, tournamentId), Query.limit(200)
                ),
                nestedType = MatchDTO::class
            ).rows.map { dtoRow ->
                dtoRow.convert { it.toMatch(dtoRow.id) }.data
            }
        }, getLocalData = {
            databaseService.getMatchDao.getMatchesOfTournament(tournamentId)
        }, saveData = { matches ->
            databaseService.getMatchDao.upsertMatches(matches)
        }, deleteData = { databaseService.getMatchDao.deleteMatchesById(it) })

    override suspend fun subscribeToMatches(): Result<Unit> {
        matchSubscription?.close()
        val channels = listOf(MATCHES_CHANNEL)
        matchSubscription = realtime.subscribe(
            channels, payloadType = MatchDTO::class
        ) { response ->
            val matchUpdates = response.payload
            scope.launch(Dispatchers.IO) {
                val id = response.channels.last().split(".").last()
                val dbMatch = databaseService.getMatchDao.getMatchById(id)
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
                    databaseService.getMatchDao.upsertMatch(updatedMatch.match)
                }
            }
        }
        return Result.success(Unit)
    }

    override suspend fun unsubscribeFromRealtime(): Result<Unit> =
        runCatching { matchSubscription?.close() }

    override fun setIgnoreMatch(match: MatchMVP?) = runCatching { _ignoreMatch.value = match }
}

@Serializable
@OptIn(ExperimentalSerializationApi::class, ExperimentalTime::class)
data class UpdateMatchArguments(
    @EncodeDefault val task: String = "updateMatch",
    @Contextual
    val time: Instant,
    val tournament: String,
    val matchId: String,
)
