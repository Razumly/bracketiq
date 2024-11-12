package com.razumly.mvp.core.data

import android.content.Context
import com.razumly.mvp.core.data.dataTypes.Bounds
import com.razumly.mvp.core.data.dataTypes.EventAbs
import com.razumly.mvp.core.data.dataTypes.EventImp
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.Match
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.Tournament
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.dtos.EventDTO
import com.razumly.mvp.core.data.dataTypes.dtos.FieldDTO
import com.razumly.mvp.core.data.dataTypes.dtos.MatchDTO
import com.razumly.mvp.core.data.dataTypes.dtos.TeamDTO
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

actual class AppwriteRepositoryImplementation(context: Context) : IAppwriteRepository {
    private val client: Client = Client(context)
        .setEndpoint("https://cloud.appwrite.io/v1") // Your API Endpoint
        .setProject("6656a4d60016b753f942") // Your project ID
        .setSelfSigned(true)
    private val account = Account(client)

    private val database = Databases(client)

    private val realTime = Realtime(client)

    private val _matchUpdates = MutableSharedFlow<Match>()
    override val matchUpdates: Flow<Match> = _matchUpdates.asSharedFlow()
    private var subscription: RealtimeSubscription? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override suspend fun login(email: String, password: String): UserData? {
        try {
            account.createEmailPasswordSession(email, password)
            return database.getDocument(
                "mvp",
                "userData",
                account.get().id,
                null,
                UserData::class.java
            ).data
        } catch (e: Exception) {
            Napier.e("Failed to login", e, "Database")
            return null
        }
    }

    override suspend fun logout() {
        account.deleteSession("current")
    }

    override suspend fun getTournament(tournamentId: String): Tournament? {
        val response: Document<TournamentDTO>?
        try {
            response = database.getDocument(
                "mvp",
                "tournaments",
                tournamentId,
                queries = null,
                TournamentDTO::class.java
            )
        } catch (e: Exception) {
            Napier.e("Failed to get tournament", e, "Database")
            return null
        }
        return response.data.copy(id = response.id, collectionId = response.collectionId)
            .toTournament()
    }

    override suspend fun getCurrentUser(): UserData? {
        val currentAccount: User<Map<String, Any>>
        try {
            currentAccount = account.get()
        } catch (e: Exception) {
            Napier.e("Failed to get current user", e, "Database")
            return null
        }
        try {
            return database.getDocument(
                "mvp",
                "userData",
                currentAccount.id,
                null,
                UserData::class.java
            ).data
        } catch (e: Exception) {
            Napier.e("Failed to get current user", e, "Database")
            return null
        }
    }

    override suspend fun getTeams(
        tournamentId: String,
        currentPlayers: Map<String, UserData>
    ): Map<String, Team> {
        try {
            return database.listDocuments(
                "mvp",
                "volleyballTeams",
                queries = listOf(Query.equal("tournament", tournamentId), Query.limit(100)),
                TeamDTO::class.java
            ).documents.map {
                it.data.copy(id = it.id)
                    .toTeam(currentPlayers)
            }.associateBy { it.id }
        } catch (e: Exception) {
            Napier.e("Failed to get teams", e, "Database")
            return emptyMap()
        }
    }

    override suspend fun getMatches(
        tournamentId: String,
        currentTeams: Map<String, Team>,
        currentMatches: MutableMap<String, Match>
    ) {
        val matchesDTO: Map<String, MatchDTO>
        try {
            matchesDTO = database.listDocuments(
                "mvp",
                "matches",
                queries = listOf(Query.equal("tournament", tournamentId), Query.limit(200)),
                MatchDTO::class.java
            ).documents.map {
                it.data.copy(id = it.id)
            }.associateBy { it.id }
        } catch (e: Exception) {
            Napier.e("Failed to get matches", e, "Database")
            return
        }
        matchesDTO.values.firstOrNull()?.toMatch(currentMatches, currentTeams, matchesDTO)
    }

    override suspend fun getFields(
        tournamentId: String,
        currentMatches: Map<String, Match>
    ): Map<String, Field> {
        try {
            return database.listDocuments(
                "mvp",
                "fields",
                queries = listOf(Query.equal("tournament", tournamentId), Query.limit(100)),
                FieldDTO::class.java
            ).documents.map { it.data.copy(id = it.id).toField(currentMatches) }
                .associateBy { it.id }
        } catch (e: Exception) {
            Napier.e("Failed to get fields", e, "Database")
            return emptyMap()
        }
    }

    override suspend fun getPlayers(tournamentId: String): Map<String, UserData> {
        try {
            return database.listDocuments(
                "mvp",
                "userData",
                listOf(Query.contains("tournaments", tournamentId), Query.limit(500)),
                UserData::class.java
            ).documents.map { it.data.copy(id = it.id) }.associateBy { it.id }
        } catch (e: Exception) {
            Napier.e("Failed to get players", e, "Database")
            return emptyMap()
        }
    }

    override suspend fun getEvents(
        bounds: Bounds
    ): List<EventAbs> {
        val docs: DocumentList<EventDTO>
        try {
            docs = database.listDocuments(
                "mvp",
                "tournaments",
                queries = listOf(
                    Query.greaterThan("lat", bounds.south),
                    Query.lessThan("lat", bounds.north),
                    Query.greaterThan("long", bounds.west),
                    Query.lessThan("long", bounds.east),
                ),
                EventDTO::class.java
            )
        } catch (e: Exception) {
            Napier.e("Failed to get events", e, "Database")
            return emptyList()
        }

        return docs.documents.map {
            it.data.copy(id = it.id, collectionId = it.collectionId).toEvent()
        }
    }

    override suspend fun subscribeToMatches(tournament: Tournament) {
        subscription?.close()
        subscription = realTime.subscribe(
            "databases.mvp.collections.matches.documents",
            payloadType = MatchDTO::class.java
        ) { response ->
            val id = response.channels.last().split(".").last()
            tournament.matches[id]?.let { match ->
                val updatedMatch = match.copy(
                    team1Points = response.payload.team1Points,
                    team2Points = response.payload.team2Points,
                    field = tournament.fields[response.payload.field],
                    refId = tournament.teams[response.payload.refId],
                    team1 = tournament.teams[response.payload.team1],
                    team2 = tournament.teams[response.payload.team2]
                )
                scope.launch {
                    _matchUpdates.emit(updatedMatch)
                }
            }
        }
    }

    override suspend fun unsubscribeFromMatches() {
        subscription?.close()
    }


    private fun FieldDTO.toField(currentMatches: Map<String, Match>): Field {
        return Field(
            inUse = inUse,
            fieldNumber = fieldNumber,
            divisions = divisions,
            matches = matches.mapNotNull { currentMatches[it] },
            tournament = tournament,
            id = id,
        )
    }

    private fun MatchDTO.toMatch(
        newMatches: MutableMap<String, Match>,
        newTeams: Map<String, Team>,
        matchesDTO: Map<String, MatchDTO>
    ): Match {
        val newMatch = Match(
            id = id,
            tournament = tournament,
            team1 = newTeams[team1],
            team2 = newTeams[team2],
            matchId = matchId,
            refId = newTeams[refId],
            field = null,
            start = Instant.parse(start),
            end = end?.let { Instant.parse(it) },
            division = division,
            team1Points = team1Points,
            team2Points = team2Points,
            losersBracket = losersBracket,
            winnerNextMatch = null,
            loserNextMatch = null,
            previousLeftMatch = null,
            previousRightMatch = null,
            setResults = setResults,
        )

        newMatches[id] = newMatch

        newMatch.winnerNextMatch =
            newMatches[winnerNextMatchId] ?: matchesDTO[winnerNextMatchId]?.toMatch(
                newMatches,
                newTeams,
                matchesDTO
            )
        newMatch.loserNextMatch =
            newMatches[loserNextMatchId] ?: matchesDTO[loserNextMatchId]?.toMatch(
                newMatches,
                newTeams,
                matchesDTO
            )
        newMatch.previousLeftMatch =
            newMatches[previousLeftId] ?: matchesDTO[previousLeftId]?.toMatch(
                newMatches,
                newTeams,
                matchesDTO
            )
        newMatch.previousRightMatch =
            newMatches[previousRightId] ?: matchesDTO[previousRightId]?.toMatch(
                newMatches,
                newTeams,
                matchesDTO
            )
        return newMatch
    }

    private fun TeamDTO.toTeam(newPlayers: Map<String, UserData>): Team {
        return Team(
            id = id,
            name = name,
            players = players.mapNotNull { newPlayers[it] },
            tournament = tournament,
            seed = seed,
            division = division,
            wins = wins,
            losses = losses,
            matches = listOf(null)
        )
    }

    private fun EventDTO.toEvent(): EventAbs {
        return EventImp(
            id = id,
            location = location,
            type = type,
            start = Instant.parse(start),
            end = Instant.parse(end),
            price = price,
            rating = rating,
            imageUrl = imageUrl,
            lat = lat,
            long = long,
            collectionId = collectionId,
        )
    }

    private suspend fun TournamentDTO.toTournament(): Tournament {
        val players = getPlayers(id)
        val teams = getTeams(id, players)
        val matches = mutableMapOf<String, Match>()
        getMatches(id, teams, matches)
        val fields = getFields(id, matches)

        fields.forEach { field ->
            field.value.matches.forEach { match ->
                match.field = field.value
            }
        }

        teams.forEach { team ->
            team.value.matches =
                matches.values.filter {
                    it.team1 == team.value || it.team2 == team.value || it.refId == team.value
                }
        }

        return Tournament(
            name = name,
            description = description,
            doubleElimination = doubleElimination,
            players = players,
            teams = teams,
            matches = matches,
            fields = fields,
            divisions = divisions,
            winnerSetCount = winnerSetCount,
            loserSetCount = loserSetCount,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory,
            loserBracketPointsToVictory = loserBracketPointsToVictory,
            winnerScoreLimitsPerSet = winnerScoreLimitsPerSet,
            loserScoreLimitsPerSet = loserScoreLimitsPerSet,
            id = id,
            location = location,
            type = type,
            start = Instant.parse(start),
            end = Instant.parse(end),
            price = price,
            rating = rating,
            imageUrl = imageUrl,
            lat = lat,
            long = long,
            collectionId = collectionId,
        )
    }

    fun cleanup() {
        scope.cancel()
    }
}