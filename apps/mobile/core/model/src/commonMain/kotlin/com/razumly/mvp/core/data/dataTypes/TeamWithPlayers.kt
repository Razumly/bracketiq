package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class TeamWithPlayers(
    @Embedded val team: Team,

    @Relation(
        parentColumn = "captainId", entityColumn = "id"
    ) val captain: UserData?,

    @Relation(
        parentColumn = "id", entityColumn = "id", associateBy = Junction(
            value = TeamPlayerCrossRef::class, parentColumn = "teamId", entityColumn = "userId"
        )
    ) val players: List<UserData>,

    @Relation(
        parentColumn = "id", entityColumn = "id", associateBy = Junction(
            value = TeamPendingPlayerCrossRef::class,
            parentColumn = "teamId",
            entityColumn = "userId"
        )
    ) val pendingPlayers: List<UserData>,

    @Transient
    @Relation(
        parentColumn = "id",
        entityColumn = "teamId",
        entity = TeamPlayerCrossRef::class,
    )
    val playerMemberships: List<TeamPlayerCrossRef> = emptyList(),

    @Transient
    @Relation(
        parentColumn = "id",
        entityColumn = "teamId",
        entity = TeamPendingPlayerCrossRef::class,
    )
    val pendingMemberships: List<TeamPendingPlayerCrossRef> = emptyList(),
) {
    fun withCanonicalMembership(): TeamWithPlayers = copy(
        team = team
            .copy(
                playerIds = playerMemberships.map(TeamPlayerCrossRef::userId),
                pending = pendingMemberships.map(TeamPendingPlayerCrossRef::userId),
            )
            .withCanonicalMembershipIds(),
    )
}
