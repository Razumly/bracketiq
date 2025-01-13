package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MVPDocument
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserTournamentCrossRef
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toEvent
import com.razumly.mvp.core.data.dataTypes.dtos.toMatch
import com.razumly.mvp.core.data.dataTypes.dtos.toTournament
import com.razumly.mvp.core.data.dataTypes.toMatchDTO
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.DbConstants.MATCHES_CHANNEL
import com.razumly.mvp.core.util.convert
import io.appwrite.Client
import io.appwrite.Query
import io.appwrite.models.Document
import io.appwrite.models.DocumentList
import io.appwrite.models.RealtimeSubscription
import io.appwrite.models.User
import io.appwrite.services.Account
import io.appwrite.services.Databases
import io.appwrite.services.Realtime
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MVPRepository(
    client: Client,
    private val tournamentDB: MVPDatabase,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : IMVPRepository {
    private val account = Account(client)

    private val database = Databases(client)

    private val realtime = Realtime(client)

    private var subscription: RealtimeSubscription? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override suspend fun login(email: String, password: String): UserData? {
        try {
            account.createEmailPasswordSession(email, password)
            val currentUser = database.getDocument<UserData>(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                account.get().id,
                null
            ).data.copy(id = account.get().id)
            tournamentDB.getUserDataDao.upsertUserData(currentUser)
            val currentUserRelations = tournamentDB.getUserDataDao.getUserDataById(account.get().id)

            return currentUserRelations
        } catch (e: Exception) {
            Napier.e("Failed to login", e, DbConstants.ERROR_TAG)
            throw e
        }
    }

    override suspend fun logout() {
        account.deleteSession("current")
    }

    override fun getTournamentFlow(
        tournamentId: String
    ) = tournamentDB.getTournamentDao.getTournamentById(tournamentId)

    override suspend fun getTournament(tournamentId: String) {
        getData(
            networkCall = {
                database.getDocument(
                    DbConstants.DATABASE_NAME,
                    DbConstants.TOURNAMENT_COLLECTION,
                    tournamentId,
                    TournamentDTO::class,
                    queries = null
                )
                    .data.toTournament()
            },
            saveCall = { tournament ->
                tournamentDB.getTournamentDao.upsertTournament(tournament)
            }
        )
        getPlayersOfTournament(tournamentId)
        getFields(tournamentId)
        val teams = getTeams(tournamentId)
        getMatches(tournamentId)
        pushTeamPlayerCrossRef(teams)
    }

    private suspend fun pushTeamPlayerCrossRef(teams: List<Team>) {
        tournamentDB.getTeamDao.upsertTeamsWithPlayers(teams)
    }

    override suspend fun getCurrentUser(update: Boolean): UserData? {
        val currentAccount: User<Map<String, Any>>
        try {
            currentAccount = account.get()
        } catch (e: Exception) {
            Napier.e("Failed to get current user", e, DbConstants.ERROR_TAG)
            return null
        }
        var currentUserData: UserData?
        if (!update) {
            currentUserData = tournamentDB.getUserDataDao.getUserDataById(currentAccount.id)
            if (currentUserData != null) {
                return currentUserData
            }
        }
        try {
            currentUserData = database.getDocument<UserData>(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                currentAccount.id,
                null,
            ).data.copy(id = currentAccount.id)
            tournamentDB.getUserDataDao.upsertUserData(currentUserData)

            return currentUserData
        } catch (e: Exception) {
            Napier.e("Failed to get current user", e, DbConstants.ERROR_TAG)
            return null
        }
    }

    override fun getTeamsWithPlayersFlow(
        tournamentId: String
    ) = tournamentDB.getTeamDao.getTeamsWithPlayers(tournamentId)
        .map { teams -> teams.associateBy { it.team.id } }
        .flowOn(ioDispatcher)

    private suspend fun getTeams(
        tournamentId: String,
    ) = getDataList(
        networkCall = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                queries = listOf(
                    Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId),
                    Query.limit(200)
                ),
                Team::class,
            ).documents
        },
        getLocalIds = { tournamentDB.getTeamDao.getTeams(tournamentId).toSet() },
        deleteStaleData = { tournamentDB.getTeamDao.deleteTeamsByIds(it) },
        saveData = { teams -> tournamentDB.getTeamDao.upsertTeams(teams) }
    )

    override fun getMatchesFlow(
        tournamentId: String
    ) = tournamentDB.getMatchDao.getMatchesByTournamentId(tournamentId)
        .map { matches -> matches.associateBy { it.match.id } }
        .flowOn(ioDispatcher)

    private suspend fun getMatches(tournamentId: String): List<MatchMVP> =
        getDataList(
            networkCall = {
                val remoteMatches = database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.MATCHES_COLLECTION,
                    listOf(
                        Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId),
                        Query.limit(200)
                    ),
                    MatchDTO::class
                ).documents
                remoteMatches.map { it.convert { matchDTO -> matchDTO.toMatch(it.id) } }
            },
            getLocalIds = {
                val localMatches = tournamentDB.getMatchDao.getMatches(tournamentId)
                localMatches.toSet()
            },
            deleteStaleData = { ids ->
                tournamentDB.getMatchDao.deleteMatchesById(ids)
            },
            saveData = { matches ->
                tournamentDB.getMatchDao.upsertMatches(matches)
            }
        )

    override fun getMatchFlow(
        matchId: String
    ) = tournamentDB.getMatchDao.getMatchFlowById(matchId)

    override suspend fun getMatch(matchId: String) = getData(
        networkCall = {
            database.getDocument<MatchDTO>(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                matchId,
                null,
            ).data.toMatch(matchId)
        },
        saveCall = { match ->
            tournamentDB.getMatchDao.upsertMatch(match)
        }
    )

    override fun getFieldsFlow(
        tournamentId: String
    ) = tournamentDB.getFieldDao.getFieldsByTournamentId(tournamentId)

    private suspend fun getFields(
        tournamentId: String
    ) = getDataList(
        networkCall = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.FIELDS_COLLECTION,
                queries = listOf(
                    Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId),
                    Query.limit(100)
                ),
                Field::class,
            ).documents
        },
        getLocalIds = { tournamentDB.getFieldDao.getFields(tournamentId).toSet() },
        deleteStaleData = { tournamentDB.getFieldDao.deleteFieldsById(it) },
        saveData = { fields -> tournamentDB.getFieldDao.upsertFields(fields) }
    )

    override fun getPlayersOfTournamentFlow(
        tournamentId: String
    ) = tournamentDB.getTournamentDao.getUsersOfTournament(tournamentId)

    private suspend fun getPlayersOfTournament(
        tournamentId: String,
    ) = getDataList(
        networkCall = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                listOf(
                    Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId),
                    Query.limit(500)
                ),
                UserData::class
            ).documents
        },
        getLocalIds = { tournamentDB.getUserDataDao.getUsers(tournamentId).toSet() },
        deleteStaleData = { tournamentDB.getUserDataDao.deleteUsersById(it) },
        saveData = { players ->
            tournamentDB.getUserDataDao.upsertUsersData(players)
            tournamentDB.getUserDataDao.upsertUserTournamentCrossRefs(players.map { user ->
                UserTournamentCrossRef(user.id, tournamentId)
            }) }
    )

    override suspend fun getEvents(
        bounds: Bounds
    ): List<EventAbs> {
        val docs: DocumentList<EventDTO>
        try {
            docs = database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                queries = listOf(
                    Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                    Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                    Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                    Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
                ),
                EventDTO::class
            )
        } catch (e: Exception) {
            Napier.e("Failed to get events", e, DbConstants.ERROR_TAG)
            return emptyList()
        }

        return docs.documents.map {
            it.data.copy(id = it.id, collectionId = it.collectionId).toEvent()
        }
    }

    override suspend fun getEvents(): List<EventAbs> {
        val currentUserTournamentIds = getCurrentUser(true)?.tournaments ?: return emptyList()
        val allDocs = mutableListOf<Document<EventDTO>>()

        try {
            var offset = 0
            var hasMore = true

            while (hasMore) {
                val docs = database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.TOURNAMENT_COLLECTION,
                    queries = listOf(
                        Query.equal("\$id", currentUserTournamentIds),
                        Query.limit(100),
                        Query.offset(offset)
                    ),
                    EventDTO::class
                )

                allDocs.addAll(docs.documents)
                hasMore = docs.documents.size >= 100
                offset += docs.documents.size
            }
        } catch (e: Exception) {
            Napier.e("Failed to get events", e, DbConstants.ERROR_TAG)
            return emptyList()
        }

        return allDocs.map {
            it.data.copy(id = it.id, collectionId = it.collectionId).toEvent()
        }
    }

    override suspend fun subscribeToMatches() {
        subscription?.close()
        val channels = listOf(MATCHES_CHANNEL)
        subscription = realtime.subscribe(
            channels,
            payloadType = MatchDTO::class
        ) { response ->
            val matchUpdates = response.payload.data
            scope.launch(Dispatchers.IO) {
                val id = response.channels.last().split(".").last()
                val dbMatch = tournamentDB.getMatchDao.getMatchById(id)
                dbMatch?.let { match ->
                    val updatedMatch = match.copy(
                        match = match.match.copy(
                            team1Points = matchUpdates.team1Points,
                            team2Points = matchUpdates.team2Points,
                            field = matchUpdates.field,
                            refId = matchUpdates.refId,
                            team1 = matchUpdates.team1,
                            team2 = matchUpdates.team2,
                            refCheckedIn = matchUpdates.refereeCheckedIn,
                        )
                    )
                    tournamentDB.getMatchDao.upsertMatch(updatedMatch.match)
                }
            }
        }
    }

    override suspend fun updateMatch(match: MatchMVP) {
        try {
            val updatedDoc = database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                match.id,
                match.toMatchDTO(),
                nestedType = MatchDTO::class
            )

            tournamentDB.getMatchDao.upsertMatch(updatedDoc.data.toMatch(updatedDoc.id))
        } catch (e: Exception) {
            Napier.e("Failed to update match", e, DbConstants.ERROR_TAG)
        }
    }

    override suspend fun createTournament(newTournament: Tournament) {
        try {
            database.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament,
                nestedType = Tournament::class
            )
        } catch (e: Exception) {
            Napier.e("Failed to create tournament", e, DbConstants.ERROR_TAG)
        }
    }

    override suspend fun unsubscribeFromRealtime() {
        subscription?.close()
    }

    private suspend fun <T> getDataList(
        networkCall: suspend () -> List<Document<T>>,
        getLocalIds: suspend () -> Set<MVPDocument>,
        saveData: suspend (List<T>) -> Unit,
        deleteStaleData: suspend (List<String>) -> Unit
    ): List<T> {
        var dataToSave: List<T> = listOf()
        try {
            // Get remote data
            val remoteData = networkCall()

            // Get current local IDs
            val localIds = getLocalIds().map { it.id }

            // Find stale items
            val staleIds = localIds - remoteData.map { it.id }.toSet()

            // Delete stale items
            deleteStaleData(staleIds.toList())

            // Save new/updated items
            dataToSave = remoteData.map { it.data }.toList()
            saveData(dataToSave)
        } catch (e: Exception) {
            Napier.e("Failed to sync data", e)
        }
        return dataToSave
    }

    private suspend fun <T> getData(
        networkCall: suspend () -> T,
        saveCall: suspend (T) -> Unit
    ) {
        try {
            // Fetch fresh data from network
            val networkResult = networkCall()
            saveCall(networkResult)

            // Updated data will be automatically emitted through the original Flow
        } catch (e: Exception) {
            Napier.e("Failed to update data", e, DbConstants.ERROR_TAG)
        }
    }

    fun cleanup() {
        scope.cancel()
    }
}

interface IMVPRepository {
    fun getTournamentFlow(tournamentId: String): Flow<Tournament?>
    suspend fun getTournament(tournamentId: String)
    fun getTeamsWithPlayersFlow(
        tournamentId: String
    ): Flow<Map<String, TeamWithPlayers>>

    fun getMatchFlow(
        matchId: String
    ): Flow<MatchWithRelations?>
    suspend fun getMatch(matchId: String)

    fun getMatchesFlow(
        tournamentId: String
    ): Flow<Map<String, MatchWithRelations>>

    fun getFieldsFlow(tournamentId: String): Flow<List<FieldWithMatches>>

    fun getPlayersOfTournamentFlow(tournamentId: String): Flow<TournamentWithRelations>
    suspend fun getEvents(bounds: Bounds): List<EventAbs>
    suspend fun getEvents(): List<EventAbs>
    suspend fun getCurrentUser(update: Boolean = false): UserData?
    suspend fun login(email: String, password: String): UserData?
    suspend fun logout()
    suspend fun subscribeToMatches()
    suspend fun unsubscribeFromRealtime()
    suspend fun updateMatch(match: MatchMVP)
    suspend fun createTournament(newTournament: Tournament)
}