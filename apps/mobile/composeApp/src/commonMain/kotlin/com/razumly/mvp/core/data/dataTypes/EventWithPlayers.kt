package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.EventTeamCrossRef
import com.razumly.mvp.core.data.dataTypes.crossRef.EventUserCrossRef

class EventWithPlayers(
    @Embedded override val event: EventImp,

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
) : EventAbsWithPlayers