package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlin.time.Duration.Companion.minutes

class MVPRepository(
    client: Client,
    private val tournamentDB: MVPDatabase
) : IMVPRepository {
    private val account = Account(client)

    private val database = Databases(client)

    private val realtime = Realtime(client)

    private val _matchUpdates = MutableSharedFlow<MatchWithRelations>()
    override val matchUpdates: Flow<MatchWithRelations> = _matchUpdates.asSharedFlow()
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
            tournamentDB.getUserDataDao().upsertUserData(currentUser)
            val currentUserRelations = tournamentDB.getUserDataDao().getUserDataById(account.get().id)

            return currentUserRelations
        } catch (e: Exception) {
            Napier.e("Failed to login", e, DbConstants.ERROR_TAG)
            throw e
        }
    }

    override suspend fun logout() {
        account.deleteSession("current")
    }

    override suspend fun getTournament(tournamentId: String): Tournament? {
        var tournament = tournamentDB.getTournamentDao().getTournamentById(tournamentId)
        val update = true
        if (tournament != null) {
            if (Clock.System.now() - tournament.lastUpdated < 5.minutes) {
                return tournament
            }
        }

        val response: Document<TournamentDTO>?
        try {
            response = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                tournamentId,
                TournamentDTO::class,
                queries = null,
            )
        } catch (e: Exception) {
            Napier.e("Failed to get tournament", e, DbConstants.ERROR_TAG)
            return null
        }
        getMatches(tournamentId, update)
        getPlayers(tournamentId, update)
        getTeams(tournamentId, update)
        getFields(tournamentId, update)
        tournament = response.data.copy(id = response.id, collectionId = response.collectionId)
            .toTournament()
        tournamentDB.getTournamentDao().upsertTournament(tournament)
        return tournament
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
            currentUserData = tournamentDB.getUserDataDao().getUserDataById(currentAccount.id)
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
            tournamentDB.getUserDataDao().upsertUserData(currentUserData)

            return currentUserData
        } catch (e: Exception) {
            Napier.e("Failed to get current user", e, DbConstants.ERROR_TAG)
            return null
        }
    }

    override suspend fun getTeams(
        tournamentId: String,
        update: Boolean,
    ): Map<String, TeamWithPlayers> {
        var teamsWithPlayers: Map<String, TeamWithPlayers>
        if (!update) {
            teamsWithPlayers =
                tournamentDB.getTeamDao().getTeamsWithPlayers(tournamentId)
                    .associateBy { it.team.id }
            if (teamsWithPlayers.isNotEmpty()) {
                return teamsWithPlayers
            }
        }
        try {
            val teams = database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.VOLLEYBALL_TEAMS_COLLECTION,
                queries = listOf(
                    Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId),
                    Query.limit(200)
                ),
                Team::class,
            ).documents.map {
                it.data.copy(id = it.id)
            }.associateBy { it.id }
            tournamentDB.getTeamDao().upsertTeamWithPlayers(teams.values.toList())
            teamsWithPlayers = tournamentDB.getTeamDao().getTeamsWithPlayers(tournamentId)
                .associateBy { it.team.id }
            return teamsWithPlayers
        } catch (e: Exception) {
            Napier.e("Failed to get teams", e, DbConstants.ERROR_TAG)
            return emptyMap()
        }
    }

    override suspend fun getMatches(
        tournamentId: String,
        update: Boolean
    ): Map<String, MatchWithRelations> {
        var matchesWithTeams: Map<String, MatchWithRelations>
        if (!update) {
            matchesWithTeams =
                tournamentDB.getMatchDao().getMatchesByTournamentId(tournamentId)
                    .associateBy { it.match.id }
            if (matchesWithTeams.isNotEmpty()) {
                return matchesWithTeams
            }
        }
        try {
            val matches = database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                listOf(
                    Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId),
                    Query.limit(200)
                ),
                MatchDTO::class
            ).documents.map {
                it.data.toMatch(it.id)
            }.associateBy { it.id }
            tournamentDB.getMatchDao().upsertMatches(matches.values.toList())
            matchesWithTeams = tournamentDB.getMatchDao().getMatchesByTournamentId(tournamentId)
                .associateBy { it.match.id }
            return matchesWithTeams
        } catch (e: Exception) {
            Napier.e("Failed to get matches", e, DbConstants.ERROR_TAG)
            return emptyMap()
        }
    }

    override suspend fun getMatch(matchId: String, update: Boolean): MatchWithRelations? {
        if (!update) {
            val matchWithRel = tournamentDB.getMatchDao().getMatchById(matchId)
            if (matchWithRel != null) {
                return matchWithRel
            }
        }
        try {
            val response = database.getDocument<MatchDTO>(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                matchId,
                null,
            )
            val match = response.data.let { it.toMatch(it.id) }
            tournamentDB.getMatchDao().upsertMatch(match)
            return tournamentDB.getMatchDao().getMatchById(matchId)
        } catch (e: Exception) {
            Napier.e("Failed to get match", e, DbConstants.ERROR_TAG)
            return null
        }
    }

    override suspend fun getFields(
        tournamentId: String,
        update: Boolean
    ): Map<String, Field> {
        var fields: Map<String, Field>
        if (!update) {
            fields =
                tournamentDB.getFieldDao().getFieldsByTournamentId(tournamentId)
                    .associateBy { it.id }
            if (fields.isNotEmpty()) {
                return fields
            }
        }
        try {
            fields = database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.FIELDS_COLLECTION,
                queries = listOf(
                    Query.equal(DbConstants.TOURNAMENT_ATTRIBUTE, tournamentId),
                    Query.limit(100)
                ),
                Field::class,
            ).documents.map { it.data.copy(id = it.id) }
                .associateBy { it.id }
            tournamentDB.getFieldDao().upsertFields(fields.values.toList())
            return fields
        } catch (e: Exception) {
            Napier.e("Failed to get fields", e, DbConstants.ERROR_TAG)
            return emptyMap()
        }
    }

    override suspend fun getPlayers(
        tournamentId: String,
        update: Boolean
    ): Map<String, UserData> {
        var players: Map<String, UserData>
        if (!update) {
            players =
                tournamentDB.getTournamentDao()
                    .getUsersOfTournament(tournamentId)
                    .players
                    .associateBy {
                    it.id
                }
            if (players.isNotEmpty()) {
                return players
            }
        }
        try {
            players = database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                listOf(
                    Query.contains(DbConstants.TOURNAMENTS_ATTRIBUTE, tournamentId),
                    Query.limit(500)
                ),
                UserData::class
            ).documents.map { it.data.copy(id = it.id) }.associateBy { it.id }

            tournamentDB.getUserDataDao().upsertUsersData(players.values.toList())
            tournamentDB.getUserDataDao().upsertUserTournamentCrossRefs(players.values.map { user ->
                UserTournamentCrossRef(user.id, tournamentId)
            })
            players = tournamentDB.getTournamentDao()
                .getUsersOfTournament(tournamentId).players.associateBy {it.id}

            return players
        } catch (e: Exception) {
            Napier.e("Failed to get players", e, DbConstants.ERROR_TAG)
            return emptyMap()
        }
    }

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
        val docs: DocumentList<EventDTO>
        val currentUserTournamentIds = getCurrentUser(true)?.tournaments ?: return emptyList()
        try {
            docs = database.listDocuments(
                DbConstants.DATABASE_NAME,
                DbConstants.TOURNAMENT_COLLECTION,
                queries = listOf(
                    Query.equal("\$id", currentUserTournamentIds),
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
                val dbMatch = tournamentDB.getMatchDao().getMatchById(id)
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
                    tournamentDB.getMatchDao().upsertMatch(updatedMatch.match)
                    _matchUpdates.emit(updatedMatch)
                }
            }
        }
    }

    override suspend fun updateMatch(match: MatchMVP) {
        try {
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


    fun cleanup() {
        scope.cancel()
    }
}

interface IMVPRepository {
    val matchUpdates: Flow<MatchWithRelations>
    suspend fun getTournament(tournamentId: String): Tournament?
    suspend fun getTeams(
        tournamentId: String, update: Boolean = false
    ): Map<String, TeamWithPlayers>

    suspend fun getMatches(
        tournamentId: String,
        update: Boolean = false
    ): Map<String, MatchWithRelations>

    suspend fun getMatch(matchId: String, update: Boolean = false): MatchWithRelations?

    suspend fun getFields(tournamentId: String, update: Boolean = false): Map<String, Field>

    suspend fun getPlayers(tournamentId: String, update: Boolean = false): Map<String, UserData>
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