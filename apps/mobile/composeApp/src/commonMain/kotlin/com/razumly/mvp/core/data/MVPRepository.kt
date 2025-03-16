package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithPlayers
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MVPDocument
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserEventCrossRef
import com.razumly.mvp.core.data.dataTypes.UserTournamentCrossRef
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toEvent
import com.razumly.mvp.core.data.dataTypes.dtos.toMatch
import com.razumly.mvp.core.data.dataTypes.dtos.toTeam
import com.razumly.mvp.core.data.dataTypes.dtos.toTournament
import com.razumly.mvp.core.data.dataTypes.dtos.toUserData
import com.razumly.mvp.core.data.dataTypes.toMatchDTO
import com.razumly.mvp.core.data.dataTypes.toUserDataDTO
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.core.util.DbConstants.MATCHES_CHANNEL
import com.razumly.mvp.core.util.DbConstants.USER_CHANNEL
import com.razumly.mvp.core.util.convert
import io.appwrite.Client
import io.appwrite.ID
import io.appwrite.Query
import io.appwrite.enums.ExecutionMethod
import io.appwrite.models.Document
import io.appwrite.models.RealtimeSubscription
import io.appwrite.services.Account
import io.appwrite.services.Databases
import io.appwrite.services.Functions
import io.appwrite.services.Realtime
import io.github.aakira.napier.Napier
import io.ktor.client.network.sockets.SocketTimeoutException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class MVPRepository(
    client: Client,
    internal val tournamentDB: MVPDatabase,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val currentUserDataSource: CurrentUserDataSource
) : IMVPRepository {
    internal val account = Account(client)
    internal val database = Databases(client)
    private val realtime = Realtime(client)
    private val functions = Functions(client)
    private var matchSubscription: RealtimeSubscription? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var _ignoreMatch: MatchMVP? = null
    private val _currentUser = getCurrentUserFlow().stateIn(scope, SharingStarted.Eagerly, null)


    override suspend fun login(email: String, password: String): UserWithRelations {
        try {
            val session = account.createEmailPasswordSession(email, password)
            val id = account.get().id
            currentUserDataSource.saveUserId(id)
            val currentUser = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                id,
                nestedType = UserDataDTO::class
            ).data.copy(id = id)
            tournamentDB.getUserDataDao.upsertUserData(currentUser.toUserData(id))
            val currentUserWithRelations =
                tournamentDB.getUserDataDao.getUserWithRelationsById(session.userId)

            return currentUserWithRelations
        } catch (e: Exception) {
            Napier.e("Failed to login", e, DbConstants.ERROR_TAG)
            throw e
        }
    }

    override suspend fun logout() {
        currentUserDataSource.saveUserId("")
        account.deleteSession("current")
    }

    override suspend fun subscribeToUserData() {
        val channels = listOf(USER_CHANNEL)
        realtime.subscribe(
            channels,
            payloadType = UserDataDTO::class
        ) { response ->
            val userUpdates = response.payload
            scope.launch(Dispatchers.IO) {
                val id = response.channels.last().split(".").last()
                tournamentDB.getUserDataDao.upsertUserData(userUpdates.toUserData(id))
            }
        }
    }

    override fun getTournamentFlow(
        tournamentId: String
    ) = tournamentDB.getTournamentDao.getTournamentFlowById(tournamentId)

    private suspend fun getTournament(tournamentId: String) {
        singleResponse(
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
                    tournament.toTournament(
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

    private suspend fun getGenericEvent(eventId: String) {
        val doc = singleResponse(
            networkCall = {
                database.getDocument(
                    DbConstants.DATABASE_NAME,
                    DbConstants.EVENT_COLLECTION,
                    eventId,
                    nestedType = EventDTO::class,
                    queries = null
                )
            },
            saveCall = { event ->
                tournamentDB.getEventImpDao.upsertEvent(
                    event.toEvent(
                        event.id
                    )
                )
            },
            localData = { id ->
                tournamentDB.getEventImpDao.getEventById(id)
            }
        )
        getPlayersOfEvent(eventId)
        if (doc != null && doc.teamSignup) {
            val teams = getTeams(eventId)
            tournamentDB.getTeamDao.upsertTeamsWithPlayers(teams)
        }
    }

    override suspend fun getEvent(event: EventAbs) {
        when (event) {
            is EventImp -> getGenericEvent(event.id)
            is Tournament -> getTournament(event.id)
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    override fun getCurrentUserFlow(): Flow<UserWithRelations?> {
        return currentUserDataSource.getUserId().flatMapLatest { userId ->
            tournamentDB.getUserDataDao.getUserWithRelationsFlowById(userId)
        }
    }

    override suspend fun getCurrentUser(): UserWithRelations? {
        var userId = ""
        try {
            userId = currentUserDataSource.getUserId().first()

        } catch (e: Exception) {
            Napier.d("No current user ID stored")
        }
        if (userId.isBlank()) {
            try {
                userId = account.get().id
                currentUserDataSource.saveUserId(userId)
            } catch (e: Exception) {
                Napier.e("Failed to get current user", e, DbConstants.ERROR_TAG)
            }
        }

        try {
            val currentUserData = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                userId,
                nestedType = UserDataDTO::class,
            ).data.copy(id = userId)
            tournamentDB.getUserDataDao.upsertUserData(currentUserData.toUserData(userId))
            val currentUserWithRelations =
                tournamentDB.getUserDataDao.getUserWithRelationsById(userId)
            return currentUserWithRelations
        } catch (e: Exception) {
            Napier.e("User missing User Data: ", e, DbConstants.ERROR_TAG)
            return null
        }
    }

    override suspend fun getPlayers(playerIds: List<String>): List<UserData>? {
        val localUsers = tournamentDB.getUserDataDao.getUserDatasById(playerIds)
        if (localUsers.size == playerIds.size) {
            return localUsers
        } else {
            val localIds = localUsers.map { user -> user.id }
            val filteredIds = playerIds.filter { id -> localIds.contains(id) }
            try {
                val userDatas = database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.USER_DATA_COLLECTION,
                    listOf(Query.equal("\$id", filteredIds)),
                    nestedType = UserDataDTO::class,
                ).documents.map{ docDTO -> docDTO.convert { it.toUserData(docDTO.id) }.data }
                tournamentDB.getUserDataDao.upsertUsersData(userDatas)

                return userDatas
            } catch (e: Exception) {
                Napier.e("User missing User Data: ", e, DbConstants.ERROR_TAG)
                return null
            }
        }
    }

    override fun getTeamsInTournamentFlow(
        tournamentId: String
    ) = tournamentDB.getTeamDao.getTeamsInTournamentFlow(tournamentId)
        .map { teams -> teams.associateBy { it.team.id } }
        .flowOn(ioDispatcher)

    override fun getTeamsWithPlayers(ids: List<String>): Flow<List<TeamWithPlayers>> =
        tournamentDB.getTeamDao.getTeamsWithPlayersFlowByIds(ids)

    private suspend fun getTeams(
        tournamentId: String,
    ) = multiResponse(
        networkCall = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                queries = listOf(
                    Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId),
                    Query.limit(200)
                ),
                TeamDTO::class,
            ).documents.map { dtoDoc -> dtoDoc.convert { it.toTeam(dtoDoc.id) } }
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
        multiResponse(
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

    override suspend fun getMatch(matchId: String) = singleResponse(
        networkCall = {
            val doc = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                matchId,
                nestedType = MatchDTO::class,
            )
            doc.convert { it.toMatch(doc.id) }
        },
        saveCall = { match ->
            tournamentDB.getMatchDao.upsertMatch(match)
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
    ) = multiResponse(
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

    override fun getPlayersOfEventFlow(
        event: EventAbs
    ): Flow<EventAbsWithPlayers?> {
        return when (event) {
            is Tournament -> tournamentDB.getTournamentDao.getUsersOfTournament(event.id)
            is EventImp -> tournamentDB.getEventImpDao.getUsersOfEvent(event.id)
        }
    }

    private suspend fun getPlayersOfEvent(
        eventId: String,
    ) = multiResponse(
        networkCall = {
            val remotePlayers =
                database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.USER_DATA_COLLECTION,
                    listOf(
                        Query.contains(DbConstants.EVENTS_ATTRIBUTE, eventId),
                        Query.limit(500)
                    ),
                    UserDataDTO::class
                ).documents
            remotePlayers.map { it.convert { userData -> userData.toUserData(it.id) } }
        },
        getLocalIds = { tournamentDB.getUserDataDao.getUsers(eventId).toSet() },
        deleteStaleData = {
            tournamentDB.getUserDataDao.deleteEventCrossRefById(it)
            tournamentDB.getUserDataDao.deleteTeamCrossRefById(it)
            tournamentDB.getUserDataDao.deleteUsersById(it)
        },
        saveData = { players ->
            tournamentDB.getUserDataDao.upsertUsersData(players)
            tournamentDB.getUserDataDao.upsertUserEventCrossRefs(players.map { user ->
                UserEventCrossRef(user.id, eventId)
            })
        }
    )

    private suspend fun getPlayersOfTournament(
        tournamentId: String,
    ) = multiResponse(
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
            val tournaments = multiResponse(
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
                    ).documents.map { dtoDoc -> dtoDoc.convert { it.toTournament(dtoDoc.id) } }
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
            val pickupEvents = multiResponse(
                networkCall = {
                    database.listDocuments(
                        DbConstants.DATABASE_NAME,
                        DbConstants.EVENT_COLLECTION,
                        queries = listOf(
                            Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                            Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                            Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                            Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
                        ),
                        EventDTO::class
                    ).documents.map { dtoDoc -> dtoDoc.convert { it.toEvent(dtoDoc.id) } }
                },
                getLocalIds = {
                    tournamentDB.getEventImpDao.getAllCachedEvents().toSet()
                },
                saveData = { pickupEvents ->
                    tournamentDB.getEventImpDao.upsertEvents(pickupEvents)
                },
                deleteStaleData = {
                    tournamentDB.getEventImpDao.deleteEventsById(it)
                }
            )
            docs = pickupEvents + tournaments
        } catch (e: Exception) {
            Napier.e("Failed to get events", e, DbConstants.ERROR_TAG)
            return emptyList()
        }

        return docs
    }

    override suspend fun getEvents(): List<EventAbs> {
        val currentUserTournamentIds = getCurrentUser()?.tournaments ?: return emptyList()
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
            it.data.copy(id = it.id).toEvent(it.id)
        }
    }

    override suspend fun subscribeToMatches() {
        matchSubscription?.close()
        val channels = listOf(MATCHES_CHANNEL)
        matchSubscription = realtime.subscribe(
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



    override suspend fun addCurrentUserToEvent(event: EventAbs) {
        if (_currentUser.value == null) {
            Napier.e("No current user")
            return
        }
        var currentUserDTO = _currentUser.value!!.user.toUserDataDTO()

        currentUserDTO = when (event) {
            is EventImp -> {
                currentUserDTO.copy(tournamentIds = currentUserDTO.tournamentIds + event.id)
            }

            is Tournament -> {
                currentUserDTO.copy(eventIds = currentUserDTO.tournamentIds + event.id)
            }
        }
        addPlayerToEvent(currentUserDTO)
    }

    private suspend fun addPlayerToEvent(user: UserDataDTO) {
        singleResponse(
            networkCall = {
                val updatedDoc = database.updateDocument(
                    DbConstants.DATABASE_NAME,
                    DbConstants.USER_DATA_COLLECTION,
                    user.id,
                    user,
                    nestedType = UserDataDTO::class
                )
                updatedDoc.convert { it.toUserData(updatedDoc.id) }
            },
            localData = { id ->
                tournamentDB.getUserDataDao.getUserDataById(id)
            },
            saveCall = { newData ->
                tournamentDB.getUserDataDao.upsertUserData(newData)
            }
        )
    }

    override suspend fun addPlayerToTeam(team: Team, player: UserData) {
        val updatedTeam = team.copy(players = team.players + player.id)
        val updatedUserData = player.copy(teams = player.teams + team.id)

        updateUser(updatedUserData)
        updateTeam(updatedTeam)
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData) {
        val updatedTeam = team.copy(players = team.players - player.id)
        val updatedUserData = player.copy(teams = player.teams - team.id)

        updateUser(updatedUserData)
        updateTeam(updatedTeam)
    }

    private suspend fun updateUser(newUserData: UserData) {
        singleResponse(
            networkCall = {
                val updatedDoc = database.updateDocument(
                    databaseId = DbConstants.DATABASE_NAME,
                    collectionId = DbConstants.USER_DATA_COLLECTION,
                    documentId = newUserData.id,
                    data = newUserData,
                    nestedType = UserDataDTO::class
                )
                updatedDoc.convert { it.toUserData(updatedDoc.id) }
            },
            localData = { id ->
                tournamentDB.getUserDataDao.getUserDataById(id)
            },
            saveCall = { newData ->
                tournamentDB.getUserDataDao.upsertUserData(newData)
            }
        )
    }

    private suspend fun updateTeam(newTeamData: Team) {
        singleResponse(
            networkCall = {
                val updatedDoc = database.updateDocument(
                    databaseId = DbConstants.DATABASE_NAME,
                    collectionId = DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                    documentId = newTeamData.id,
                    data = newTeamData,
                    nestedType = TeamDTO::class
                )
                updatedDoc.convert { it.toTeam(updatedDoc.id) }
            },
            localData = { id ->
                tournamentDB.getTeamDao.getTeamWithPlayers(id)?.team
            },
            saveCall = { newData ->
                tournamentDB.getTeamDao.upsertTeam(newData)
            }
        )
    }

    override suspend fun addTeamToEvent(event: EventAbs, team: TeamWithPlayers) {
        team.players.forEach { player ->
            val updatedPlayer = when (event) {
                is EventImp -> {
                    player.copy(tournamentIds = player.tournamentIds + event.id)
                }
                is Tournament -> {
                    player.copy(eventIds = player.tournamentIds + event.id)
                }
            }

            try {
                addPlayerToEvent(updatedPlayer.toUserDataDTO())
            } catch (e: Exception) {
                Napier.e("Failed to update User Data", e, DbConstants.ERROR_TAG)
            }
        }

        val updatedTeam = when (event) {
            is EventImp -> {
                team.team.toTeamDTO().copy(eventIds = team.team.eventIds + event.id)
            }

            is Tournament -> {
                team.team.toTeamDTO().copy(tournamentIds = team.team.tournamentIds + event.id)
            }
        }

        try {
            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                team.team.id,
                updatedTeam,
                nestedType = TeamDTO::class
            )

            tournamentDB.getTeamDao.upsertTeam(updatedTeam.toTeam(updatedTeam.id))
        } catch (e: Exception) {
            Napier.e("Failed to add team: ", e, DbConstants.ERROR_TAG)
        }
    }

    override suspend fun updateTournament(newTournament: Tournament): Tournament? {
        try {
            val updatedDoc = database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament.toTournamentDTO(),
                nestedType = TournamentDTO::class
            )
            val tournament = updatedDoc.data.toTournament(updatedDoc.id)

            tournamentDB.getTournamentDao.upsertTournament(tournament)
            return tournament
        } catch (e: Exception) {
            Napier.e("Failed to update match", e, DbConstants.ERROR_TAG)
        }
        return null
    }

    override suspend fun createEvent(newEvent: EventImp) =
        singleResponse(
            networkCall = {
                val doc = database.createDocument(
                    DbConstants.DATABASE_NAME,
                    DbConstants.EVENT_COLLECTION,
                    newEvent.id,
                    newEvent.toEventDTO(),
                    nestedType = EventDTO::class
                )
                doc.convert { it.toEvent(doc.id) }
            },
            localData = { id ->
                tournamentDB.getEventImpDao.getEventById(id)
            },
            saveCall = { event ->
                tournamentDB.getEventImpDao.upsertEvent(event)
            }
        )

    override suspend fun createTournament(newTournament: Tournament) =
        singleResponse(
            networkCall = {
                val doc = database.createDocument(
                    DbConstants.DATABASE_NAME,
                    DbConstants.TOURNAMENT_COLLECTION,
                    newTournament.id,
                    newTournament.toTournamentDTO(),
                    nestedType = TournamentDTO::class
                )
                doc.convert { dto -> dto.toTournament(doc.id) }
            },
            localData = { id ->
                tournamentDB.getTournamentDao.getTournamentById(id)
            },
            saveCall = { tournament ->
                tournamentDB.getTournamentDao.upsertTournament(tournament)
            }
        )

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
                data = UserDataDTO(firstName, lastName, listOf(), listOf(), listOf(), userId),
            )
        } catch (e: Exception) {
            Napier.e("Failed to create a user", e, DbConstants.ERROR_TAG)
        }
    }

    override suspend fun unsubscribeFromRealtime() {
        matchSubscription?.close()
    }

    private suspend fun <T> multiResponse(
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

    private suspend fun <T> singleResponse(
        networkCall: suspend () -> Document<T>,
        localData: suspend (id: String) -> MVPDocument?,
        saveCall: suspend (T) -> Unit
    ): T? {
        try {
            // Fetch fresh data from network
            val networkResult = networkCall()
            saveCall(networkResult.data)
            if (localData(networkResult.id) == null) {
                throw Exception("Local data was not updated")
            }
            return networkResult.data
        } catch (e: Exception) {
            Napier.e("Failed to update data", e, DbConstants.ERROR_TAG)
            return null
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
    suspend fun getEvent(event: EventAbs)
    fun getTeamsInTournamentFlow(
        tournamentId: String
    ): Flow<Map<String, TeamWithPlayers>>

    fun getTeamsWithPlayers(ids: List<String>): Flow<List<TeamWithPlayers>>

    fun getMatchFlow(
        matchId: String
    ): Flow<MatchWithRelations>

    suspend fun getMatch(matchId: String): MatchMVP?

    fun getMatchesFlow(
        tournamentId: String
    ): Flow<Map<String, MatchWithRelations>>

    fun getFieldsFlow(tournamentId: String): Flow<List<FieldWithMatches>>

    suspend fun getPlayers(playerIds: List<String>): List<UserData>?

    fun getPlayersOfEventFlow(event: EventAbs): Flow<EventAbsWithPlayers?>
    suspend fun getEvents(bounds: Bounds): List<EventAbs>
    suspend fun getEvents(): List<EventAbs>
    fun getCurrentUserFlow(): Flow<UserWithRelations?>
    suspend fun getCurrentUser(): UserWithRelations?
    suspend fun login(email: String, password: String): UserWithRelations?
    suspend fun logout()
    suspend fun subscribeToUserData()
    suspend fun subscribeToMatches()
    suspend fun unsubscribeFromRealtime()
    suspend fun updateMatchUnsafe(match: MatchMVP)
    suspend fun updateMatchSafe(match: MatchMVP)
    suspend fun updateMatchFinished(match: MatchMVP, time: Instant)
    suspend fun updateTournament(newTournament: Tournament): Tournament?
    suspend fun addCurrentUserToEvent(event: EventAbs)
    suspend fun addTeamToEvent(event: EventAbs, team: TeamWithPlayers)
    suspend fun addPlayerToTeam(team: Team, player: UserData)
    suspend fun removePlayerFromTeam(team: Team, player: UserData)
    suspend fun createTournament(newTournament: Tournament): Tournament?
    suspend fun createNewUser(email: String, password: String, firstName: String, lastName: String)
    suspend fun createEvent(newEvent: EventImp): EventImp?
    fun setIgnoreMatch(match: MatchMVP?)
}