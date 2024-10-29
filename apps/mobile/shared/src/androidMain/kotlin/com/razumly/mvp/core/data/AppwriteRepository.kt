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
import io.appwrite.models.User
import io.appwrite.services.Account
import io.appwrite.services.Databases
import io.github.aakira.napier.Napier
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

actual class AppwriteRepository(context: Context) {
    private val client: Client = Client(context)
        .setEndpoint("https://cloud.appwrite.io/v1") // Your API Endpoint
        .setProject("6656a4d60016b753f942") // Your project ID
        .setSelfSigned(true)
    private val account: Account = Account(client)

    actual val currentUser: UserData? = null
    private val _events = mutableListOf<EventAbs>()
    actual val events: List<EventAbs>
        get() = _events

    private val database: Databases = Databases(client)

    actual suspend fun login(email: String, password: String): UserData? {
        account.createEmailPasswordSession(email, password)
        return database.getDocument(
            "mvp",
            "userData",
            account.get().id,
            null,
            UserData::class.java
        ).data
    }

    actual suspend fun logout() {
        account.deleteSession("current")
    }

    actual suspend fun getTournament(tournamentId: String): Tournament? {
        var response: Document<TournamentDTO>? = null
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
        return response?.data?.copy(id = response.id, collectionId = response.collectionId)
            ?.toTournament()
    }

    actual suspend fun getCurrentUser(): UserData? {
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

    actual suspend fun getTeams(
        tournamentId: String,
        currentPlayers: Map<String, UserData?>
    ): Map<String, Team?> {
        try {
            return database.listDocuments(
                "mvp",
                "volleyballTeams",
                queries = listOf(Query.equal("tournament", tournamentId)),
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

    actual suspend fun getMatches(
        tournamentId: String,
        currentTeams: Map<String, Team?>,
        currentMatches: MutableMap<String, Match?>
    ) {
        val matchesDTO: Map<String, MatchDTO>
        try {
            matchesDTO = database.listDocuments(
                "mvp",
                "matches",
                queries = listOf(Query.equal("tournament", tournamentId)),
                MatchDTO::class.java
            ).documents.map {
                it.data.copy(id = it.id)
            }.associateBy { it.id }
        } catch (e: Exception) {
            Napier.e("Failed to get matches", e, "Database")
            return
        }
        matchesDTO.values.firstOrNull()?.let {
            currentMatches[it.id] = it.toMatch(currentMatches, currentTeams, matchesDTO)
        }
    }

    actual suspend fun getFields(
        tournamentId: String,
        currentMatches: Map<String, Match?>
    ): Map<String, Field?> {
        try {
            return database.listDocuments(
                "mvp",
                "fields",
                queries = listOf(Query.equal("tournament", tournamentId)),
                FieldDTO::class.java
            ).documents.map { it.data.copy(id = it.id).toField(currentMatches) }
                .associateBy { it.id }
        } catch (e: Exception) {
            Napier.e("Failed to get fields", e, "Database")
            return emptyMap()
        }
    }

    actual suspend fun getPlayers(tournamentId: String): Map<String, UserData?> {
        try {
            return database.listDocuments(
                "mvp",
                "userData",
                listOf(Query.contains("tournaments", tournamentId)),
                UserData::class.java
            ).documents.map { it.data }.associateBy { it.id }
        } catch (e: Exception) {
            Napier.e("Failed to get players", e, "Database")
            return emptyMap()
        }
    }

    actual suspend fun getEvents(
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

    private fun FieldDTO.toField(currentMatches: Map<String, Match?>): Field {
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
        newMatches: Map<String, Match?>,
        newTeams: Map<String, Team?>,
        matchesDTO: Map<String, MatchDTO>
    ): Match {
        return Match(
            id = id,
            tournament = tournament,
            team1 = newTeams[team1],
            team2 = newTeams[team2],
            matchId = matchId,
            refId = newTeams[refId],
            field = null,
            start = Instant.parse(start).toLocalDateTime(TimeZone.UTC),
            end = end?.let { Instant.parse(it).toLocalDateTime(TimeZone.UTC) },
            team1Points = team1Points,
            team2Points = team2Points,
            losersBracket = losersBracket,
            winnerNextMatch = newMatches[winnerNextMatch] ?: matchesDTO[winnerNextMatch]?.toMatch(
                newMatches,
                newTeams,
                matchesDTO
            ),
            loserNextMatch = newMatches[winnerNextMatch] ?: matchesDTO[winnerNextMatch]?.toMatch(
                newMatches,
                newTeams,
                matchesDTO
            ),
            previousLeftMatch = newMatches[winnerNextMatch] ?: matchesDTO[winnerNextMatch]?.toMatch(
                newMatches,
                newTeams,
                matchesDTO
            ),
            previousRightMatch = newMatches[winnerNextMatch]
                ?: matchesDTO[winnerNextMatch]?.toMatch(newMatches, newTeams, matchesDTO),
            setResults = setResults,
        )
    }

    private fun TeamDTO.toTeam(newPlayers: Map<String, UserData?>): Team {
        return Team(
            id = id,
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
            start = Instant.parse(start).toLocalDateTime(TimeZone.UTC),
            end = Instant.parse(end).toLocalDateTime(TimeZone.UTC),
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
        val matches = mutableMapOf<String, Match?>()
        getMatches(id, teams, matches)
        val fields = getFields(id, matches)

        fields.forEach { field ->
            field.value?.matches?.forEach { match ->
                match.field = field.value
            }
        }
        teams.forEach { team ->
            team.value?.matches =
                matches.values.filter {
                    it?.team1 == team.value || it?.team2 == team.value || it?.refId == team.value
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
            start = Instant.parse(start).toLocalDateTime(TimeZone.UTC),
            end = Instant.parse(end).toLocalDateTime(TimeZone.UTC),
            price = price,
            rating = rating,
            imageUrl = imageUrl,
            lat = lat,
            long = long,
            collectionId = collectionId,
        )
    }
}