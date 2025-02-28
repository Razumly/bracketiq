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
import com.razumly.mvp.core.data.dataTypes.UserTournamentCrossRef
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import com.razumly.mvp.core.data.dataTypes.dtos.PickupGameDTO
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toEvent
import com.razumly.mvp.core.data.dataTypes.dtos.toMatch
import com.razumly.mvp.core.data.dataTypes.dtos.toPickupGame
import com.razumly.mvp.core.data.dataTypes.dtos.toTournament
import com.razumly.mvp.core.data.dataTypes.dtos.toUserData
import com.razumly.mvp.core.data.dataTypes.toMatchDTO
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.DbConstants.MATCHES_CHANNEL
import com.razumly.mvp.core.util.convert
import io.appwrite.Client
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.enums.ExecutionMethod
import io.appwrite.enums.OAuthProvider
import io.appwrite.models.Document
import io.appwrite.models.RealtimeSubscription
import io.appwrite.models.User
import io.appwrite.services.Account
import io.appwrite.services.Databases
import io.appwrite.services.Functions
import io.appwrite.services.Realtime
import io.github.aakira.napier.Napier
import io.ktor.client.network.sockets.SocketTimeoutException
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
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.koin.mp.KoinPlatform.getKoin

class MVPRepository(
    client: Client,
    internal val tournamentDB: MVPDatabase,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : IMVPRepository {
    internal val account = Account(client)

    internal val database = Databases(client)

    private val realtime = Realtime(client)

    private val functions = Functions(client)

    private var subscription: RealtimeSubscription? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var _ignoreMatch: MatchMVP? = null

    override suspend fun login(email: String, password: String): UserWithRelations? {
        try {
            account.createEmailPasswordSession(email, password)
            val id = account.get().id
            val currentUser = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                id,
                nestedType =  UserDataDTO::class
            ).data.copy(id = id)
            tournamentDB.getUserDataDao.upsertUserData(currentUser.toUserData(id))
            val currentUserRelations =
                tournamentDB.getUserDataDao.getUserWithRelationsById(account.get().id)

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
    ) = tournamentDB.getTournamentDao.getTournamentFlowById(tournamentId)

    override suspend fun getTournament(tournamentId: String) {
        getData(
            networkCall = {
                database.getDocument(
                    DbConstants.DATABASE_NAME,
                    DbConstants.TOURNAMENT_COLLECTION,
                    tournamentId,
                    nestedType = TournamentDTO::class,
                    queries = null
                )
            },
            saveCall = { tournament ->
                tournamentDB.getTournamentDao.upsertTournament(
                    tournament.data.toTournament(
                        tournament.id
                    )
                )
            },
            localData = { id ->
                tournamentDB.getTournamentDao.getTournamentById(id)
            }
        )
        getPlayersOfTournament(tournamentId)
        getFields(tournamentId)
        val teams = getTeams(tournamentId)
        getMatches(tournamentId)
        tournamentDB.getTeamDao.upsertTeamsWithPlayers(teams)
    }

    override suspend fun getCurrentUser(update: Boolean): UserWithRelations? {
        val currentAccount: User<Map<String, Any>>
        try {
            currentAccount = account.get()
        } catch (e: Exception) {
            Napier.e("Failed to get current user", e, DbConstants.ERROR_TAG)
            return null
        }
        var currentUserWithRelations: UserWithRelations?
        if (!update) {
            currentUserWithRelations =
                tournamentDB.getUserDataDao.getUserWithRelationsById(currentAccount.id)
            if (currentUserWithRelations != null) {
                return currentUserWithRelations
            }
        }

        try {
            val currentUserData = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                currentAccount.id,
                nestedType = UserDataDTO::class,
            ).data.copy(id = currentAccount.id)
            tournamentDB.getUserDataDao.upsertUserData(currentUserData.toUserData(currentAccount.id))
            currentUserWithRelations =
                tournamentDB.getUserDataDao.getUserWithRelationsById(currentAccount.id)
            return currentUserWithRelations
        } catch (e: Exception) {
            Napier.e("User missing User Data: ", e, DbConstants.ERROR_TAG)
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
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                matchId,
                nestedType = MatchDTO::class,
            )
        },
        saveCall = { match ->
            tournamentDB.getMatchDao.upsertMatch(match.data.toMatch(matchId))
        },
        localData = { id ->
            tournamentDB.getMatchDao.getMatchById(id)?.match
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
            val remotePlayers =
                database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.USER_DATA_COLLECTION,
                    listOf(
                        Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId),
                        Query.limit(500)
                    ),
                    UserDataDTO::class
                ).documents
            remotePlayers.map { it.convert { userData -> userData.toUserData(it.id) } }
        },
        getLocalIds = { tournamentDB.getUserDataDao.getUsers(tournamentId).toSet() },
        deleteStaleData = {
            tournamentDB.getUserDataDao.deleteTournamentCrossRefById(it)
            tournamentDB.getUserDataDao.deleteTeamCrossRefById(it)
            tournamentDB.getUserDataDao.deleteUsersById(it)
        },
        saveData = { players ->
            tournamentDB.getUserDataDao.upsertUsersData(players)
            tournamentDB.getUserDataDao.upsertUserTournamentCrossRefs(players.map { user ->
                UserTournamentCrossRef(user.id, tournamentId)
            })
        }
    )

    override suspend fun getEvents(
        bounds: Bounds
    ): List<EventAbs> {
        val docs: List<EventAbs>
        try {
            val tournaments = getDataList(
                networkCall = {
                    database.listDocuments(
                        DbConstants.DATABASE_NAME,
                        DbConstants.TOURNAMENT_COLLECTION,
                        queries = listOf(
                            Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                            Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                            Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                            Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
                        ),
                        TournamentDTO::class
                    ).documents.map { dtoDoc -> dtoDoc.convert { it.toTournament(it.id) } }
                },
                getLocalIds = {
                    tournamentDB.getTournamentDao.getAllCachedTournaments().toSet()
                },
                saveData = { tournaments ->
                    tournamentDB.getTournamentDao.upsertTournaments(tournaments)
                },
                deleteStaleData = {
                    tournamentDB.getTournamentDao.deleteTournamentsById(it)
                }
            )
            val pickupGames = getDataList(
                networkCall = {
                    database.listDocuments(
                        DbConstants.DATABASE_NAME,
                        DbConstants.PICKUP_GAME_COLLECTION,
                        queries = listOf(
                            Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                            Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                            Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                            Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
                        ),
                        PickupGameDTO::class
                    ).documents.map { dtoDoc -> dtoDoc.convert { it.toPickupGame(it.id) } }
                },
                getLocalIds = {
                    tournamentDB.getPickupGameDao.getAllCachedPickupGames().toSet()
                },
                saveData = { pickupGames ->
                    tournamentDB.getPickupGameDao.upsertPickupGames(pickupGames)
                },
                deleteStaleData = {
                    tournamentDB.getPickupGameDao.deletePickupGamesById(it)
                }
            )
            docs = pickupGames as List<EventAbs> + tournaments as List<EventAbs>
        } catch (e: Exception) {
            Napier.e("Failed to get events", e, DbConstants.ERROR_TAG)
            return emptyList()
        }

        return docs
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
            val matchUpdates = response.payload
            scope.launch(Dispatchers.IO) {
                val id = response.channels.last().split(".").last()
                val dbMatch = tournamentDB.getMatchDao.getMatchById(id)
                if (dbMatch?.match?.id == _ignoreMatch?.id) {
                    return@launch
                }
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
                            start = Instant.parse(matchUpdates.start),
                            end = matchUpdates.end?.let { Instant.parse(it) }
                        )
                    )
                    tournamentDB.getMatchDao.upsertMatch(updatedMatch.match)
                }
            }
        }
    }

    override suspend fun updateMatchUnsafe(match: MatchMVP) {
        try {
            tournamentDB.getMatchDao.upsertMatch(match)

            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                match.id,
                match.toMatchDTO(),
                nestedType = MatchDTO::class
            )
        } catch (e: Exception) {
            Napier.e("Failed to update match", e, DbConstants.ERROR_TAG)
        }
    }

    override suspend fun updateMatchSafe(match: MatchMVP) {
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

    override suspend fun updateMatchFinished(match: MatchMVP, time: Instant) {
        val args = UpdateMatchArgs(match.id, time.toString(), match.tournamentId)
        val jsonArgs = Json.encodeToString(args)
        try {
            functions.createExecution(
                "updateMatch",
                jsonArgs,
                false,
                method = ExecutionMethod.POST
            )
        } catch (e: SocketTimeoutException) {
            Napier.e("Connection timeout, retrying...", e, DbConstants.ERROR_TAG)
            updateMatchFinished(match, time) // Simple retry
        } catch (e: Exception) {
            Napier.e("Failed to update finished match", e, DbConstants.ERROR_TAG)
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

    override suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String
    ) {
        try {
            val userId = ID.unique()
            account.create(
                userId = userId,
                email = email,
                password = password,
            )
            database.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.USER_DATA_COLLECTION,
                documentId = userId,
                nestedType = UserDataDTO::class,
                data = UserDataDTO(firstName, lastName, listOf(), listOf(), userId),
            )
        } catch (e: Exception) {
            Napier.e("Failed to create a user", e, DbConstants.ERROR_TAG)
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
        networkCall: suspend () -> Document<T>,
        localData: suspend (id: String) -> MVPDocument?,
        saveCall: suspend (Document<T>) -> Unit
    ) {
        try {
            // Fetch fresh data from network
            val networkResult = networkCall()
            saveCall(networkResult)
            if (localData(networkResult.id) == null) {
                throw Exception("Local data was not updated")
            }
        } catch (e: Exception) {
            Napier.e("Failed to update data", e, DbConstants.ERROR_TAG)
        }
    }

    override fun setIgnoreMatch(match: MatchMVP?) {
        _ignoreMatch = match
    }

    fun cleanup() {
        scope.cancel()
    }
}

@Serializable
data class UpdateMatchArgs(
    val matchId: String,
    val time: String,
    val tournament: String,
)

interface IMVPRepository {
    fun getTournamentFlow(tournamentId: String): Flow<Tournament?>
    suspend fun getTournament(tournamentId: String)
    fun getTeamsWithPlayersFlow(
        tournamentId: String
    ): Flow<Map<String, TeamWithPlayers>>

    fun getMatchFlow(
        matchId: String
    ): Flow<MatchWithRelations>

    suspend fun getMatch(matchId: String)

    fun getMatchesFlow(
        tournamentId: String
    ): Flow<Map<String, MatchWithRelations>>

    fun getFieldsFlow(tournamentId: String): Flow<List<FieldWithMatches>>

    fun getPlayersOfTournamentFlow(tournamentId: String): Flow<TournamentWithRelations?>
    suspend fun getEvents(bounds: Bounds): List<EventAbs>
    suspend fun getEvents(): List<EventAbs>
    suspend fun getCurrentUser(update: Boolean = false): UserWithRelations?
    suspend fun login(email: String, password: String): UserWithRelations?
    suspend fun logout()
    suspend fun subscribeToMatches()
    suspend fun unsubscribeFromRealtime()
    suspend fun updateMatchUnsafe(match: MatchMVP)
    suspend fun updateMatchSafe(match: MatchMVP)
    suspend fun updateMatchFinished(match: MatchMVP, time: Instant)
    suspend fun createTournament(newTournament: Tournament)
    suspend fun createNewUser(email: String, password: String, firstName: String, lastName: String)
    fun setIgnoreMatch(match: MatchMVP?)
}