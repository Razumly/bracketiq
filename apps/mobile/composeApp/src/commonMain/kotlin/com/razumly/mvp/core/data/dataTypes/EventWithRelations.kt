package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation

class EventWithRelations (
    @Embedded val event: EventImp,
    @Relation(
            parentColumn = "id",
            entityColumn = "id",
            associateBy = Junction(
                value = UserEventCrossRef::class,
                parentColumn = "eventId",
                entityColumn = "userId"
            )
        )
        val players: List<UserData>
)