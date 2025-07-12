package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.crossRef.FieldMatchCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.MatchTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentMatchCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentUserCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toTournament
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.multiResponse
import com.razumly.mvp.core.data.repositories.IMVPRepository.Companion.singleResponse
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.convert
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.appwrite.Query
import io.appwrite.services.Databases
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

interface ITournamentRepository : IMVPRepository {
    fun getTournamentWithRelationsFlow(tournamentId: String): Flow<Result<TournamentWithRelations>>
    fun getTournamentFlow(tournamentId: String): Flow<Result<Tournament>>
    fun getTournamentsFlow(query: String): Flow<Result<List<Tournament>>>
    fun resetCursor()
    suspend fun getTournamentWithRelations(tournamentId: String): Result<TournamentWithRelations>
    suspend fun getTournament(tournamentId: String): Result<Tournament>
    suspend fun getTournaments(query: String): Result<List<Tournament>>
    suspend fun createTournament(newTournament: Tournament): Result<Tournament>
    suspend fun updateTournament(newTournament: Tournament): Result<Tournament>
    suspend fun updateLocalTournament(newTournament: Tournament): Result<Tournament>
    suspend fun deleteTournament(tournamentId: String): Result<Unit>
}

class TournamentRepository(
    private val databaseService: DatabaseService,
    private val database: Databases,
    private val teamRepository: ITeamRepository,
    private val userRepository: IUserRepository,
    private val matchRepository: IMatchRepository,
    private val fieldRepository: IFieldRepository
) : ITournamentRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var lastDocumentId = ""

    init {
        scope.launch {
            databaseService.getTournamentDao.deleteAllTournaments()
        }
    }

    override fun resetCursor() {
        lastDocumentId = ""
    }

    override fun getTournamentWithRelationsFlow(tournamentId: String): Flow<Result<TournamentWithRelations>> =
        callbackFlow {
            // Emit local data
            val localJob = launch {
                databaseService.getTournamentDao.getTournamentWithRelationsFlow(tournamentId)
                    .collect { tournament ->
                        trySend(Result.success(tournament))
                    }
            }

            // Fetch remote data and emit failure if needed
            val remoteJob = launch {
                val result = getTournament(tournamentId)
                result.onSuccess {
                    val fieldsDeferred =
                        async { fieldRepository.getFieldsInTournament(tournamentId) }
                    val playersDeferred = if (result.getOrNull()?.playerIds?.isNotEmpty() == true) {
                        async { userRepository.getUsers(result.getOrNull()?.playerIds ?: listOf()) }
                    } else { async { Result.success(emptyList()) } }
                    val hostDeferred = async { userRepository.getUsers(listOf(it.hostId)) }
                    val teamsDeferred = if (result.getOrNull()?.teamIds?.isNotEmpty() == true) {
                        async { teamRepository.getTeams(result.getOrNull()?.teamIds ?: listOf()) }
                    } else { async { Result.success(emptyList()) } }
                    val matchesDeferred =
                        async { matchRepository.getMatchesOfTournament(tournamentId) }

                    val fieldsResult = fieldsDeferred.await()
                    val playersResult = playersDeferred.await()
                    val hostResult = hostDeferred.await()
                    val teamsResult = teamsDeferred.await()
                    val matchesResult = matchesDeferred.await()

                    listOf(
                        fieldsResult, playersResult, hostResult, teamsResult, matchesResult
                    ).forEach { res ->
                        res.onFailure { error ->
                            trySend(Result.failure(error))
                        }
                    }

                    insertCrossReferences(
                        players = playersResult.getOrThrow(),
                        host = hostResult.getOrThrow(),
                        teams = teamsResult.getOrThrow(),
                        matches = matchesResult.getOrThrow(),
                        tournamentId = tournamentId
                    )
                }.onFailure { error ->
                    trySend(Result.failure(error))
                }
            }

            awaitClose {
                localJob.cancel()
                remoteJob.cancel()
            }
        }

    private suspend fun insertCrossReferences(
        players: List<UserData>,
        host: List<UserData>,
        teams: List<Team>,
        matches: List<MatchMVP>,
        tournamentId: String
    ) {
        databaseService.getTeamDao.upsertTournamentTeamCrossRefs(teams.map {
            TournamentTeamCrossRef(
                tournamentId, it.id
            )
        })
        databaseService.getUserDataDao.upsertUserTournamentCrossRefs(players.map {
            TournamentUserCrossRef(
                it.id, tournamentId
            )
        })
        databaseService.getUserDataDao.upsertUserTournamentCrossRefs(host.map {
            TournamentUserCrossRef(
                it.id, tournamentId
            )
        })
        databaseService.getMatchDao.upsertTournamentMatchCrossRefs(matches.map {
            TournamentMatchCrossRef(
                tournamentId, it.id
            )
        })
        databaseService.getTeamDao.upsertMatchTeamCrossRefs(
            matches.map { match ->
                listOfNotNull(match.team1?.let { MatchTeamCrossRef(it, match.id) },
                    match.team2?.let { MatchTeamCrossRef(it, match.id) })
            }.flatten()
        )
        databaseService.getTeamDao.upsertTeamPlayerCrossRefs(teams.map {
            it.playerIds.map { playerId ->
                TeamPlayerCrossRef(
                    it.id, playerId
                )
            }
        }.flatten())
        matches.map { match ->
            match.field?.let { FieldMatchCrossRef(it, match.id) }
        }.let { databaseService.getMatchDao.upsertFieldMatchCrossRefs(it.filterNotNull()) }
    }

    override fun getTournamentFlow(tournamentId: String): Flow<Result<Tournament>> =
        databaseService.getTournamentDao.getTournamentFlowById(tournamentId)
            .map { Result.success(it) }

    override suspend fun getTournaments(query: String): Result<List<Tournament>> {
        val combinedQuery = if (lastDocumentId.isNotEmpty()) {
            listOf(query, Query.cursorAfter(lastDocumentId))
        } else {
            listOf(query)
        }
        val response = multiResponse(getRemoteData = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                queries = combinedQuery,
                TournamentDTO::class
            ).documents.map { dtoDoc -> dtoDoc.convert { it.toTournament(dtoDoc.id) }.data }
        },
            getLocalData = { emptyList() },
            saveData = { databaseService.getTournamentDao.upsertTournaments(it) },
            deleteData = { })
        lastDocumentId = response.getOrNull()?.lastOrNull()?.id ?: lastDocumentId
        return response
    }

    override fun getTournamentsFlow(query: String): Flow<Result<List<Tournament>>> {
        val localFlow = databaseService.getTournamentDao.getAllCachedTournamentsFlow()
            .map { Result.success(it) }
        return localFlow
    }

    override suspend fun getTournament(tournamentId: String): Result<Tournament> =
        singleResponse(networkCall = {
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                tournamentId,
                nestedType = TournamentDTO::class,
                queries = null
            ).data.toTournament(tournamentId)
        }, saveCall = { tournament ->
            databaseService.getTournamentDao.upsertTournamentWithRelations(tournament)
        }, onReturn = {
            databaseService.getTournamentDao.getTournamentById(tournamentId)
        })

    override suspend fun getTournamentWithRelations(tournamentId: String): Result<TournamentWithRelations> =
        singleResponse(networkCall = {
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                tournamentId,
                nestedType = TournamentDTO::class,
                queries = null
            ).data.toTournament(tournamentId)
        }, saveCall = { tournament ->
            databaseService.getTournamentDao.upsertTournament(tournament)
        }, onReturn = {
            databaseService.getTournamentDao.getTournamentWithRelations(tournamentId)
        })

    override suspend fun createTournament(newTournament: Tournament): Result<Tournament> =
        singleResponse(networkCall = {
            database.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament.toTournamentDTO(),
                nestedType = TournamentDTO::class
            ).data.toTournament(newTournament.id)
        }, saveCall = { tournament ->
            databaseService.getTournamentDao.upsertTournament(tournament)
        }, onReturn = { tournament ->
            tournament
        })

    override suspend fun updateTournament(newTournament: Tournament): Result<Tournament> =
        singleResponse(networkCall = {
            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament.toTournamentDTO(),
                nestedType = TournamentDTO::class
            ).data.toTournament(newTournament.id)
        }, saveCall = { tournament ->
            databaseService.getTournamentDao.upsertTournament(tournament)
        }, onReturn = { tournament ->
            tournament
        })

    override suspend fun updateLocalTournament(newTournament: Tournament): Result<Tournament> =
        runCatching {
            databaseService.getTournamentDao.upsertTournament(newTournament)
            newTournament
        }

    override suspend fun deleteTournament(tournamentId: String): Result<Unit> = kotlin.runCatching {
        database.deleteDocument(
            DbConstants.DATABASE_NAME, DbConstants.TOURNAMENT_COLLECTION, tournamentId
        )
        databaseService.getTournamentDao.deleteTournamentWithCrossRefs(tournamentId)
    }
}