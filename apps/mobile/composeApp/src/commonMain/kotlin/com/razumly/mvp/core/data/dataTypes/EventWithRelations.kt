package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef

class EventWithRelations(
    @Embedded override val event: EventImp,

    @Relation(
        parentColumn = "hostId",
        entityColumn = "id",
    )
    override val host: UserData?,

    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = EventUserCrossRef::class,
            parentColumn = "eventId",
            entityColumn = "userId"
        )
    )
    override val players: List<UserData> = listOf(),

    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(
            value = EventTeamCrossRef::class,
            parentColumn = "eventId",
            entityColumn = "teamId"
        )
    )
    override val teams: List<Team> = listOf(),
) : EventAbsWithRelations