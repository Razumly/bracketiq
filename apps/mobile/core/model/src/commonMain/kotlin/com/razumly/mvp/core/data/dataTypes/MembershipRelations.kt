package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.ChatUserCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPendingPlayerCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.TeamPlayerCrossRef

/**
 * Room-only projections that retain relation IDs even when the related user profile is not cached.
 * Domain models keep their API-facing list properties, while junction rows remain the sole local
 * persistence source for those properties.
 */
data class TeamMembershipRelations(
    @Embedded val team: Team,
    @Relation(
        parentColumn = "id",
        entityColumn = "teamId",
        entity = TeamPlayerCrossRef::class,
    )
    val players: List<TeamPlayerCrossRef>,
    @Relation(
        parentColumn = "id",
        entityColumn = "teamId",
        entity = TeamPendingPlayerCrossRef::class,
    )
    val pendingPlayers: List<TeamPendingPlayerCrossRef>,
) {
    fun toDomain(): Team = team
        .copy(
            playerIds = players.map(TeamPlayerCrossRef::userId),
            pending = pendingPlayers.map(TeamPendingPlayerCrossRef::userId),
        )
        .withCanonicalMembershipIds()
}

data class UserTeamMembershipRelations(
    @Embedded val user: UserData,
    @Relation(
        parentColumn = "id",
        entityColumn = "userId",
        entity = TeamPlayerCrossRef::class,
    )
    val teams: List<TeamPlayerCrossRef>,
) {
    fun toDomain(): UserData = user.copy(teamIds = teams.map(TeamPlayerCrossRef::teamId))
}

data class ChatGroupMembershipRelations(
    @Embedded val chatGroup: ChatGroup,
    @Relation(
        parentColumn = "id",
        entityColumn = "chatId",
        entity = ChatUserCrossRef::class,
    )
    val users: List<ChatUserCrossRef>,
) {
    fun toDomain(): ChatGroup = chatGroup.copy(userIds = users.map(ChatUserCrossRef::userId))
}
