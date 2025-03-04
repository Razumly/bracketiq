package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "user_event_cross_ref",
    primaryKeys = ["userId", "eventId"],
    foreignKeys = [
        ForeignKey(
            entity = UserData::class,
            parentColumns = ["id"],
            childColumns = ["userId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = Tournament::class,
            parentColumns = ["id"],
            childColumns = ["eventId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("userId"),
        Index("eventId")
    ]
)
data class UserEventCrossRef(
    val userId: String,
    val eventId: String
)