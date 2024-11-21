package com.razumly.mvp.core.data

import android.content.Context
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP
import com.razumly.mvp.core.data.dataTypes.MatchWithRelations
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toEvent
import com.razumly.mvp.core.data.dataTypes.dtos.toMatch
import com.razumly.mvp.core.data.dataTypes.dtos.toTournament
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.Client
import io.appwrite.Query
import io.appwrite.extensions.toJson
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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.format
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes

actual class AppwriteRepositoryImplementation(context: Context) : IAppwriteRepository {
    private val client: Client = Client(context)
        .setEndpoint("https://cloud.appwrite.io/v1") // Your API Endpoint
        .setProject("6656a4d60016b753f942") // Your project ID
        .setSelfSigned(true)

    private val tournamentDB = getTournamentDatabase(context)

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
            val currentUser = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                account.get().id,
                null,
                UserData::class.java
            ).data.copy(id = account.get().id)
            tournamentDB.getUserDataDao().upsertUserData(currentUser)
            return currentUser
        } catch (e: Exception) {
            Napier.e("Failed to login", e, DbConstants.ERROR_TAG)
            return null
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
                queries = null,
                TournamentDTO::class.java
            )
        } catch (e: Exception) {
            Napier.e("Failed to get tournament", e, DbConstants.ERROR_TAG)
            return null
        }
        getMatches(tournamentId, update)
        getTeams(tournamentId, update)
        getPlayers(tournamentId, update)
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
            currentUserData = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                currentAccount.id,
                null,
                UserData::class.java
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
                Team::class.java
            ).documents.map {
                it.data.copy(id = it.id)
            }.associateBy { it.id }
            tournamentDB.getTeamDao().upsertTeams(teams.values.toList())
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
                MatchDTO::class.java
            ).documents.map {
                it.data.copy(id = it.id).toMatch()
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
            val response = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                matchId,
                null,
                MatchDTO::class.java
            )
            val match = response.data.toMatch()
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
                Field::class.java
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
                tournamentDB.getUserDataDao().getUserDataByTournamentId(tournamentId)
                    .associateBy { it.id }
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
                UserData::class.java
            ).documents.map { it.data.copy(id = it.id) }.associateBy { it.id }

            tournamentDB.getUserDataDao().upsertUsersData(players.values.toList())
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
                EventDTO::class.java
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
        val channel = String.format(
            DbConstants.CHANNEL,
            DbConstants.DATABASE_NAME,
            DbConstants.MATCHES_COLLECTION
        )
        subscription = realtime.subscribe(
            channel,
            payloadType = MatchDTO::class.java
        ) { response ->
            scope.launch {
                val id = response.channels.last().split(".").last()
                val dbMatch = tournamentDB.getMatchDao().getMatchById(id)
                dbMatch?.let { match ->
                    val updatedMatch = match.copy(
                        match = match.match.copy(
                            team1Points = response.payload.team1Points,
                            team2Points = response.payload.team2Points,
                            field = response.payload.field,
                            refId = response.payload.refId,
                            team1 = response.payload.team1,
                            team2 = response.payload.team2,
                            refCheckedIn = response.payload.refereeCheckedIn,
                        )
                    )
                    tournamentDB.getMatchDao().upsertMatch(updatedMatch.match)
                    _matchUpdates.emit(updatedMatch)
                }
            }
        }
    }

    override suspend fun updateMatch(match: MatchWithRelations) {
        tournamentDB.getMatchDao().upsertMatch(match.match)
        try {
            val updateData = mapOf(
                "setResults" to match.match.setResults,
                "refereeCheckedIn" to match.match.refCheckedIn,
                "refId" to match.match.refId,
                "team1Points" to match.match.team1Points,
                "team2Points" to match.match.team2Points,
                "start" to match.match.start.toString(),
                "end" to match.match.end?.toString(),
                // Add other fields you need to update
            )
            database.updateDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.MATCHES_COLLECTION,
                match.match.id,
                updateData
            )
        } catch (e: Exception) {
            Napier.e("Failed to update match", e, DbConstants.ERROR_TAG)
        }
    }

    override suspend fun unsubscribeFromRealtime() {
        subscription?.close()
    }


    fun cleanup() {
        scope.cancel()
    }
}