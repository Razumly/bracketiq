package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "user_pickup_game_cross_ref",
    primaryKeys = ["userId", "pickupGameId"],
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
            childColumns = ["pickupGameId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("userId"),
        Index("pickupGameId")
    ]
)
data class UserPickupGameCrossRef(
    val userId: String,
    val pickupGameId: String
)