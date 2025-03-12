package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.razumly.mvp.core.data.dataTypes.dtos.TournamentDTO
import com.razumly.mvp.core.data.dataTypes.enums.Division
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.dataTypes.enums.FieldType
import io.appwrite.ID
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Entity
@Serializable
data class Tournament(
    val doubleElimination: Boolean,
    val winnerSetCount: Int,
    val loserSetCount: Int,
    val winnerBracketPointsToVictory: List<Int>,
    val loserBracketPointsToVictory: List<Int>,
    val winnerScoreLimitsPerSet: List<Int>,
    val loserScoreLimitsPerSet: List<Int>,
    @PrimaryKey override var id: String,
    override val name: String,
    override val description: String,
    override val divisions: List<Division>,
    override val location: String,
    override val fieldType: FieldType,
    override val start: Instant,
    override val end: Instant,
    override val price: Double,
    override val rating: Float,
    override val imageUrl: String,
    override val lat: Double,
    override val long: Double,
    override val hostId: String,
    @Transient override val eventType: EventType = EventType.TOURNAMENT,
    @Transient override val lastUpdated: Instant = Clock.System.now(),
    override val maxPlayers: Int,
    override val teamSizeLimit: Int,
) : EventAbs {
    companion object {
        operator fun invoke(): Tournament {
            return Tournament(
                doubleElimination = false,
                winnerSetCount = 0,
                loserSetCount = 0,
                winnerBracketPointsToVictory = listOf(),
                loserBracketPointsToVictory = listOf(),
                winnerScoreLimitsPerSet = listOf(),
                loserScoreLimitsPerSet = listOf(),
                id = ID.unique(),
                name = "",
                description = "",
                divisions = listOf(),
                location = "",
                fieldType = FieldType.GRASS,
                start = Instant.DISTANT_PAST,
                end = Instant.DISTANT_PAST,
                hostId = "",
                price = 0.0,
                rating = 0f,
                imageUrl = "",
                lat = 0.0,
                long = 0.0,
                maxPlayers = 0,
                teamSizeLimit = 0,
            )
        }
    }

    fun updateTournamentFromEvent(event: EventImp): Tournament {
        return this.copy(
            name = event.name,
            description = event.description,
            divisions = event.divisions,
            location = event.location,
            fieldType = event.fieldType,
            start = event.start,
            end = event.end,
            price = event.price,
            rating = event.rating ?: 0f,
            imageUrl = event.imageUrl,
            lat = event.lat,
            long = event.long,
            maxPlayers = event.maxPlayers,
            teamSizeLimit = event.teamSizeLimit,
            hostId = event.hostId
        )
    }
    fun toEvent(id: String): EventImp {
        return EventImp(
            id = id,
            location = location,
            name = name,
            description = description,
            divisions = divisions,
            fieldType = fieldType,
            start = start,
            end = end,
            price = price,
            rating = rating,
            imageUrl = imageUrl,
            lat = lat,
            long = long,
            lastUpdated = Clock.System.now(),
            hostId = hostId,
            teamSizeLimit = teamSizeLimit,
            maxPlayers = maxPlayers,
        )
    }
    fun toTournamentDTO(): TournamentDTO {
        return TournamentDTO(
            name = name,
            description = description,
            doubleElimination = doubleElimination,
            divisions = divisions.map { it.name },
            winnerSetCount = winnerSetCount,
            loserSetCount = loserSetCount,
            winnerBracketPointsToVictory = winnerBracketPointsToVictory,
            loserBracketPointsToVictory = loserBracketPointsToVictory,
            winnerScoreLimitsPerSet = winnerScoreLimitsPerSet,
            loserScoreLimitsPerSet = loserScoreLimitsPerSet,
            id = id,
            location = location,
            fieldType = fieldType.name,
            start = start.toString(),
            end = end.toString(),
            price = price,
            rating = rating,
            imageUrl = imageUrl,
            hostId = hostId,
            lat = lat,
            long = long,
            maxPlayers = maxPlayers,
            teamSizeLimit = teamSizeLimit
        )
    }
}