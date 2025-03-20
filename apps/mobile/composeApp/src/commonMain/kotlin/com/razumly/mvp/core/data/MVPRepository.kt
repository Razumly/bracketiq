package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventAbsWithPlayers
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.EventWithRelations
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.FieldWithMatches
import com.razumly.mvp.core.data.dataTypes.MVPDocument
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithRelations
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.TournamentWithRelations
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TournamentUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef
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
import com.razumly.mvp.core.data.dataTypes.enums.EventType
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


    override suspend fun login(email: String, password: String): UserWithRelations? {
        var currentUserWithRelations: UserWithRelations? = null
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
            currentUserWithRelations =
                tournamentDB.getUserDataDao.getUserWithRelationsById(session.userId)
        } catch (e: Exception) {
            Napier.e("Failed to login", e, DbConstants.ERROR_TAG)
        }
        return currentUserWithRelations
    }

    override suspend fun logout() {
        currentUserDataSource.saveUserId("")
        account.deleteSession("current")
    }

    override suspend fun subscribeToUserData() {
        val channels = listOf(USER_CHANNEL)
        realtime.subscribe(
            channels, payloadType = UserDataDTO::class
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

    private suspend fun getTournament(tournamentId: String): TournamentWithRelations? {
        IMVPRepository.singleResponse(networkCall = {
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                tournamentId,
                nestedType = TournamentDTO::class,
                queries = null
            )
        }, saveCall = { tournament ->
            tournamentDB.getTournamentDao.upsertTournament(
                tournament.toTournament(
                    tournament.id
                )
            )
        })
        getPlayersOfTournament(tournamentId)
        getFields(tournamentId)
        val teams = getTeamsInTournament(tournamentId)
        getMatches(tournamentId)
        tournamentDB.getTeamDao.upsertTeamsWithPlayers(teams)
        return tournamentDB.getTournamentDao.getTournamentWithRelations(tournamentId)
    }

    private suspend fun getGenericEvent(eventId: String): EventWithRelations? {
        val doc = IMVPRepository.singleResponse(networkCall = {
            database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.EVENT_COLLECTION,
                eventId,
                nestedType = EventDTO::class,
                queries = null
            )
        }, saveCall = { event ->
            tournamentDB.getEventImpDao.upsertEvent(
                event.toEvent(
                    event.id
                )
            )
        })
        getPlayersOfEvent(eventId)
        if (doc != null && doc.teamSignup) {
            val teams = getTeamsInEvent(eventId)
            tournamentDB.getTeamDao.upsertTeamsWithPlayers(teams)
        }
        return tournamentDB.getEventImpDao.getEventWithRelationsById(eventId)
    }

    override suspend fun getEvent(event: EventAbs): EventAbsWithPlayers? {
        val eventWithPlayers = when (event) {
            is EventImp -> getGenericEvent(event.id)
            is Tournament -> getTournament(event.id)
        }
        return eventWithPlayers
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
            getTeams(currentUserData.teamIds)
            tournamentDB.getTeamDao.upsertTeamPlayerCrossRefs(currentUserData.teamIds.map { teamId ->
                TeamPlayerCrossRef(
                    teamId, currentUserData.id
                )
            })
            val currentUserWithRelations =
                tournamentDB.getUserDataDao.getUserWithRelationsById(userId)
            return currentUserWithRelations
        } catch (e: Exception) {
            Napier.e("User missing User Data: ", e, DbConstants.ERROR_TAG)
            return null
        }
    }

    override fun getPlayersFlow(playerIds: List<String>): Flow<List<UserWithRelations>> =
        tournamentDB.getUserDataDao.getUserByIdFlow(playerIds)

    override suspend fun getPlayers(playerIds: List<String>?, query: String?): List<UserData>? {
        val queryList = playerIds?.let {
            if (playerIds.isEmpty()) return null
            listOf(Query.equal("\$id", playerIds))
        } ?: query?.let {
            if (query.isBlank()) return null
            listOf(
                Query.or(
                    listOf(
                        Query.contains("userName", query),
                        Query.contains("firstName", query),
                        Query.contains("lastName", query)
                    )
                )
            )
        }

        return queryList?.let {
            IMVPRepository.multiResponse(networkCall = {
                database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.USER_DATA_COLLECTION,
                    queryList,
                    nestedType = UserDataDTO::class,
                ).documents.map { docDTO -> docDTO.convert { it.toUserData(docDTO.id) }.data }
            }, getLocalIds = {
                playerIds?.let {
                    tournamentDB.getUserDataDao.getUserDatasById(playerIds).toSet()
                } ?: tournamentDB.getUserDataDao.searchUsers(query!!).toSet()
            }, saveData = { newData ->
                tournamentDB.getUserDataDao.upsertUsersData(newData)
            }, deleteStaleData = { ids ->
                tournamentDB.getUserDataDao.deleteUsersById(ids)
            })
        }
    }

    override fun getTeamsInTournamentFlow(
        tournamentId: String
    ) = tournamentDB.getTeamDao.getTeamsInTournamentFlow(tournamentId)

    override fun getTeamsWithPlayersFlow(ids: List<String>): Flow<List<TeamWithRelations>> =
        tournamentDB.getTeamDao.getTeamsWithPlayersFlowByIds(ids)

    private suspend fun getTeams(teamIds: List<String>): List<TeamWithRelations>? {
        val teams = IMVPRepository.multiResponse(networkCall = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                queries = listOf(
                    Query.equal("\$id", teamIds), Query.limit(200)
                ),
                TeamDTO::class,
            ).documents.map { dtoDoc -> dtoDoc.convert { it.toTeam(dtoDoc.id) }.data }
        }, getLocalIds = {
            tournamentDB.getTeamDao.getTeams(teamIds)?.toSet() ?: emptySet()
        }, saveData = { teams ->
            tournamentDB.getTeamDao.upsertTeams(teams)
        }, deleteStaleData = { ids ->
            tournamentDB.getTeamDao.deleteTeamsByIds(ids)
        })

        return tournamentDB.getTeamDao.getTeamsWithPlayers(teams.map { it.id })
    }

    private suspend fun getTeamsInEvent(eventId: String) = IMVPRepository.multiResponse(
        networkCall = {
            database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.EVENT_COLLECTION,
                queries = listOf(
                    Query.equal(DbConstants.EVENTS_ATTRIBUTE, eventId), Query.limit(200)
                ),
                TeamDTO::class,
            ).documents.map { dtoDoc -> dtoDoc.convert { it.toTeam(dtoDoc.id) }.data }
        },
        getLocalIds = { tournamentDB.getTeamDao.getTeamsInEvent(eventId).toSet() },
        deleteStaleData = { tournamentDB.getTeamDao.deleteTeamsByIds(it) },
        saveData = { teams -> tournamentDB.getTeamDao.upsertTeams(teams) })

    private suspend fun getTeamsInTournament(
        tournamentId: String,
    ) = IMVPRepository.multiResponse(networkCall = {
        database.listDocuments(
            DbConstants.DATABASE_NAME,
            DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
            queries = listOf(
                Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId), Query.limit(200)
            ),
            TeamDTO::class,
        ).documents.map { dtoDoc -> dtoDoc.convert { it.toTeam(dtoDoc.id) }.data }
    },
        getLocalIds = { tournamentDB.getTeamDao.getTeamsInTournament(tournamentId).toSet() },
        deleteStaleData = { tournamentDB.getTeamDao.deleteTeamsByIds(it) },
        saveData = { teams -> tournamentDB.getTeamDao.upsertTeams(teams) })

    override fun getMatchesFlow(
        tournamentId: String
    ) = tournamentDB.getMatchDao.getMatchesByTournamentId(tournamentId)
        .map { matches -> matches.associateBy { it.match.id } }.flowOn(ioDispatcher)

    private suspend fun getMatches(tournamentId: String): List<MatchMVP> =
        IMVPRepository.multiResponse(networkCall = {
            val remoteMatches = database.listDocuments(
                DbConstants.DATABASE_NAME, DbConstants.MATCHES_COLLECTION, listOf(
                    Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId), Query.limit(200)
                ), MatchDTO::class
            ).documents
            remoteMatches.map { it.convert { matchDTO -> matchDTO.toMatch(it.id) }.data }
        }, getLocalIds = {
            val localMatches = tournamentDB.getMatchDao.getMatchesOfTournament(tournamentId)
            localMatches.toSet()
        }, deleteStaleData = { ids ->
            tournamentDB.getMatchDao.deleteMatchesById(ids)
        }, saveData = { matches ->
            tournamentDB.getMatchDao.upsertMatches(matches)
        })

    override fun getMatchFlow(
        matchId: String
    ) = tournamentDB.getMatchDao.getMatchFlowById(matchId)

    override suspend fun getMatch(matchId: String) = IMVPRepository.singleResponse(networkCall = {
        val doc = database.getDocument(
            DbConstants.DATABASE_NAME,
            DbConstants.MATCHES_COLLECTION,
            matchId,
            nestedType = MatchDTO::class,
        )
        doc.convert { it.toMatch(doc.id) }
    }, saveCall = { match ->
        tournamentDB.getMatchDao.upsertMatch(match)
    })

    override fun getFieldsFlow(
        tournamentId: String
    ) = tournamentDB.getFieldDao.getFieldsByTournamentId(tournamentId)

    private suspend fun getFields(
        tournamentId: String
    ) = IMVPRepository.multiResponse(networkCall = {
        database.listDocuments(
            DbConstants.DATABASE_NAME,
            DbConstants.FIELDS_COLLECTION,
            queries = listOf(
                Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId), Query.limit(100)
            ),
            Field::class,
        ).documents.map { it.data }
    },
        getLocalIds = { tournamentDB.getFieldDao.getFields(tournamentId).toSet() },
        deleteStaleData = { tournamentDB.getFieldDao.deleteFieldsById(it) },
        saveData = { fields -> tournamentDB.getFieldDao.upsertFields(fields) })

    override fun getPlayersOfEventFlow(
        event: EventAbs
    ): Flow<EventAbsWithPlayers?> {
        return when (event) {
            is Tournament -> tournamentDB.getTournamentDao.getTournamentWithRelationsFlow(event.id)
            is EventImp -> tournamentDB.getEventImpDao.getUsersOfEvent(event.id)
        }
    }

    private suspend fun getPlayersOfEvent(
        eventId: String,
    ) = IMVPRepository.multiResponse(networkCall = {
        val remotePlayers = database.listDocuments(
            DbConstants.DATABASE_NAME, DbConstants.USER_DATA_COLLECTION, listOf(
                Query.contains(DbConstants.EVENTS_ATTRIBUTE, eventId), Query.limit(500)
            ), UserDataDTO::class
        ).documents
        remotePlayers.map { it.convert { userData -> userData.toUserData(it.id) }.data }
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
                EventUserCrossRef(user.id, eventId)
            })
        })

    private suspend fun getPlayersOfTournament(
        tournamentId: String,
    ) = IMVPRepository.multiResponse(networkCall = {
        val remotePlayers = database.listDocuments(
            DbConstants.DATABASE_NAME, DbConstants.USER_DATA_COLLECTION, listOf(
                Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId),
                Query.limit(500)
            ), UserDataDTO::class
        ).documents
        remotePlayers.map { it.convert { userData -> userData.toUserData(it.id) }.data }
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
                TournamentUserCrossRef(user.id, tournamentId)
            })
        })

    override suspend fun getEvents(
        bounds: Bounds?, query: String?
    ): List<EventAbs> {
        val docs: List<EventAbs>
        try {
            val queries = bounds?.let {
                listOf(
                    Query.greaterThan(DbConstants.LAT_ATTRIBUTE, bounds.south),
                    Query.lessThan(DbConstants.LAT_ATTRIBUTE, bounds.north),
                    Query.greaterThan(DbConstants.LONG_ATTRIBUTE, bounds.west),
                    Query.lessThan(DbConstants.LONG_ATTRIBUTE, bounds.east),
                )
            } ?: query?.let { listOf(it) }

            val tournaments = IMVPRepository.multiResponse(networkCall = {
                database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.TOURNAMENT_COLLECTION,
                    queries = queries,
                    TournamentDTO::class
                ).documents.map { dtoDoc -> dtoDoc.convert { it.toTournament(dtoDoc.id) }.data }
            }, getLocalIds = {
                tournamentDB.getTournamentDao.getAllCachedTournaments().toSet()
            }, saveData = { tournaments ->
                tournamentDB.getTournamentDao.upsertTournaments(tournaments)
            }, deleteStaleData = {
                tournamentDB.getTournamentDao.deleteTournamentsById(it)
            })
            val pickupEvents = IMVPRepository.multiResponse(networkCall = {
                database.listDocuments(
                    DbConstants.DATABASE_NAME,
                    DbConstants.EVENT_COLLECTION,
                    queries = queries,
                    EventDTO::class
                ).documents.map { dtoDoc -> dtoDoc.convert { it.toEvent(dtoDoc.id) }.data }
            }, getLocalIds = {
                tournamentDB.getEventImpDao.getAllCachedEvents().toSet()
            }, saveData = { pickupEvents ->
                tournamentDB.getEventImpDao.upsertEvents(pickupEvents)
            }, deleteStaleData = {
                tournamentDB.getEventImpDao.deleteEventsById(it)
            })
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
                    DbConstants.DATABASE_NAME, DbConstants.TOURNAMENT_COLLECTION, queries = listOf(
                        Query.equal("\$id", currentUserTournamentIds),
                        Query.limit(100),
                        Query.offset(offset)
                    ), EventDTO::class
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
            channels, payloadType = MatchDTO::class
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
                "updateMatch", jsonArgs, false, method = ExecutionMethod.POST
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

        val eventWithPlayers = getEvent(event)

        if (eventWithPlayers != null && eventWithPlayers.players.size >= eventWithPlayers.event.maxPlayers) {
            when (event) {
                is EventImp -> {
                    updateEvent(event.copy(waitList = event.waitList + currentUserDTO.id))

                }
                is Tournament -> {
                    updateTournament(event.copy(waitList = event.waitList + currentUserDTO.id))
                }
            }
            return
        }
        currentUserDTO = when (event.eventType) {
            EventType.EVENT -> {
                currentUserDTO.copy(tournamentIds = currentUserDTO.tournamentIds + event.id)
            }

            EventType.TOURNAMENT -> {
                currentUserDTO.copy(eventIds = currentUserDTO.tournamentIds + event.id)
            }
        }

        if (event.teamSignup) {
            when (event) {
                is EventImp -> {
                    updateEvent(event.copy(freeAgents = event.freeAgents + currentUserDTO.id))

                }
                is Tournament -> {
                    updateTournament(event.copy(freeAgents = event.freeAgents + currentUserDTO.id))
                }
            }
            return
        }

        updateUser(currentUserDTO)
    }

    private suspend fun updateUser(user: UserDataDTO) {
        IMVPRepository.singleResponse(networkCall = {
            val updatedDoc = database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                user.id,
                user,
                nestedType = UserDataDTO::class
            )
            updatedDoc.convert { it.toUserData(updatedDoc.id) }
        }, saveCall = { newData ->
            tournamentDB.getUserDataDao.upsertUserData(newData)
        })
    }

    override suspend fun changeTeamName(team: Team) {
        updateTeam(team)
    }

    override suspend fun addPlayerToTeam(team: Team, player: UserData) {
        if (!team.players.contains(player.id)) {
            val updatedTeam = team.copy(players = team.players + player.id)
            updateTeam(updatedTeam)
        }
        if (!player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds + team.id)
            updateUser(updatedUserData)
        }
        tournamentDB.getTeamDao.upsertTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
    }

    override suspend fun removePlayerFromTeam(team: Team, player: UserData) {
        if (team.players.contains(player.id)) {
            val updatedTeam = team.copy(players = team.players - player.id)
            updateTeam(updatedTeam)
        }
        if (player.teamIds.contains(team.id)) {
            val updatedUserData = player.copy(teamIds = player.teamIds - team.id)
            updateUser(updatedUserData)
        }
        tournamentDB.getTeamDao.deleteTeamPlayerCrossRef(TeamPlayerCrossRef(team.id, player.id))
    }

    private suspend fun updateEvent(newEvent: EventImp) {
        IMVPRepository.singleResponse(networkCall = {
            val updatedDoc = database.updateDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.EVENT_COLLECTION,
                documentId = newEvent.id,
                data = newEvent.toEventDTO(),
                nestedType = EventDTO::class
            )
            updatedDoc.convert { it.toEvent(updatedDoc.id) }
        }, saveCall = { newData ->
            tournamentDB.getEventImpDao.upsertEvent(newData)
        })
    }

    private suspend fun updateUser(newUserData: UserData) {
        IMVPRepository.singleResponse(networkCall = {
            val updatedDoc = database.updateDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.USER_DATA_COLLECTION,
                documentId = newUserData.id,
                data = newUserData.toUserDataDTO(),
                nestedType = UserDataDTO::class
            )
            updatedDoc.convert { it.toUserData(updatedDoc.id) }
        }, saveCall = { newData ->
            tournamentDB.getUserDataDao.upsertUserData(newData)
        })
    }

    private suspend fun updateTeam(newTeamData: Team) {
        IMVPRepository.singleResponse(networkCall = {
            val updatedDoc = database.updateDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                documentId = newTeamData.id,
                data = newTeamData.toTeamDTO(),
                nestedType = TeamDTO::class
            )
            updatedDoc.convert { it.toTeam(updatedDoc.id) }
        }, saveCall = { newData ->
            tournamentDB.getTeamDao.upsertTeam(newData)
        })
    }

    override suspend fun addTeamToEvent(event: EventAbs, team: TeamWithRelations) {
        val eventWithPlayers = getEvent(event) ?: return
        if (event.waitList.contains(team.team.id)) {
            return
        }
        if (eventWithPlayers.players.size >= eventWithPlayers.event.maxPlayers) {
            when (event) {
                is EventImp -> {
                    updateEvent(event.copy(waitList = event.waitList + team.team.id))

                }
                is Tournament -> {
                    updateTournament(event.copy(waitList = event.waitList + team.team.id))
                }
            }
            return
        }
        team.players.forEach { player ->
            if (eventWithPlayers.players.contains(player)) {
                return
            }
            val updatedPlayer = when (event) {
                is EventImp -> {
                    player.copy(eventIds = player.tournamentIds + event.id)
                }

                is Tournament -> {
                    player.copy(tournamentIds = player.tournamentIds + event.id)
                }
            }

            try {
                updateUser(updatedPlayer.toUserDataDTO())
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
                DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
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

    override suspend fun createEvent(newEvent: EventImp) = IMVPRepository.singleResponse(networkCall = {
        val doc = database.createDocument(
            DbConstants.DATABASE_NAME,
            DbConstants.EVENT_COLLECTION,
            newEvent.id,
            newEvent.toEventDTO(),
            nestedType = EventDTO::class
        )
        doc.convert { it.toEvent(doc.id) }
    }, saveCall = { event ->
        tournamentDB.getEventImpDao.upsertEvent(event)
    })

    override suspend fun createTournament(newTournament: Tournament) =
        IMVPRepository.singleResponse(networkCall = {
            val doc = database.createDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                newTournament.id,
                newTournament.toTournamentDTO(),
                nestedType = TournamentDTO::class
            )
            doc.convert { dto -> dto.toTournament(doc.id) }
        }, saveCall = { tournament ->
            tournamentDB.getTournamentDao.upsertTournament(tournament)
        })

    override suspend fun createNewUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        userName: String,
    ): UserData? {
        try {
            val userId = ID.unique()
            account.create(
                userId = userId, email = email, password = password, name = userName
            )
            val doc = database.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.USER_DATA_COLLECTION,
                documentId = userId,
                nestedType = UserDataDTO::class,
                data = UserDataDTO(firstName, lastName, userName, userId),
            )
            return doc.data.toUserData(doc.id)
        } catch (e: Exception) {
            Napier.e("Failed to create a user", e, DbConstants.ERROR_TAG)
        }
        return null
    }

    override suspend fun createTeam() {
        val id = ID.unique()
        val currentUser = _currentUser.value ?: return
        IMVPRepository.singleResponse(networkCall = {
            database.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                documentId = id,
                data = Team(captainId = currentUser.user.id).toTeamDTO(),
                nestedType = TeamDTO::class,
            ).convert { it.toTeam(id) }.data
        }, saveCall = { team ->
            tournamentDB.getTeamDao.upsertTeam(team)
        }).onSuccess { team ->
            addPlayerToTeam(team, currentUser.user)
        }.onFailure { e ->
            Napier.e("Failed to createTeam", e)
        }
    }

    override suspend fun unsubscribeFromRealtime() {
        matchSubscription?.close()
    }

    override suspend fun searchEvents(query: String): List<EventAbs> {
        return getEvents(query = Query.contains("name", query))
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
    suspend fun getEvent(event: EventAbs): EventAbsWithPlayers?
    fun getTeamsInTournamentFlow(
        tournamentId: String
    ): Flow<List<TeamWithRelations>>

    fun getTeamsWithPlayersFlow(ids: List<String>): Flow<List<TeamWithRelations>>

    fun getMatchFlow(
        matchId: String
    ): Flow<MatchWithRelations>

    suspend fun getMatch(matchId: String): MatchMVP?

    fun getMatchesFlow(
        tournamentId: String
    ): Flow<Map<String, MatchWithRelations>>

    fun getFieldsFlow(tournamentId: String): Flow<List<FieldWithMatches>>

    fun getPlayersFlow(playerIds: List<String>): Flow<List<UserWithRelations>>
    suspend fun getPlayers(playerIds: List<String>? = null, query: String? = null): List<UserData>?

    fun getPlayersOfEventFlow(event: EventAbs): Flow<EventAbsWithPlayers?>
    suspend fun getEvents(bounds: Bounds? = null, query: String? = null): List<EventAbs>
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
    suspend fun changeTeamName(team: Team)
    suspend fun addTeamToEvent(event: EventAbs, team: TeamWithRelations)
    suspend fun addPlayerToTeam(team: Team, player: UserData)
    suspend fun removePlayerFromTeam(team: Team, player: UserData)
    suspend fun createTournament(newTournament: Tournament): Tournament?
    suspend fun createNewUser(
        email: String, password: String, firstName: String, lastName: String, userName: String
    ): UserData?

    suspend fun createEvent(newEvent: EventImp): EventImp?
    suspend fun createTeam()
    suspend fun searchEvents(query: String): List<EventAbs>
    fun setIgnoreMatch(match: MatchMVP?)

    companion object {
        suspend fun <T : MVPDocument, R> singleResponse(
            networkCall: suspend () -> T, saveCall: suspend (T) -> Unit, onReturn: suspend (T) -> R
        ): Result<R> {
            return runCatching{
                // Fetch fresh data from network
                val networkResult = networkCall()
                saveCall(networkResult)
                onReturn(networkResult)
            }
        }

        suspend fun <T : MVPDocument> multiResponse(
            networkCall: suspend () -> List<T>,
            getLocalIds: suspend () -> Set<T>,
            saveData: suspend (List<T>) -> Unit,
            deleteStaleData: suspend (List<String>) -> Unit
        ): Result<List<T>> {
            return runCatching {
                // Get remote data
                val remoteData = networkCall()

                // Get current local IDs
                val localIds = getLocalIds().map { it.id }

                // Find stale items
                val staleIds = localIds - remoteData.map { it.id }.toSet()

                // Delete stale items
                deleteStaleData(staleIds.toList())

                // Save new/updated items
                if (remoteData.isNotEmpty()) {
                    val dataToSave = remoteData.toList()
                    saveData(dataToSave)
                    dataToSave
                } else {
                    throw Exception("Remote data came back empty")
                }
            }
        }
    }
}