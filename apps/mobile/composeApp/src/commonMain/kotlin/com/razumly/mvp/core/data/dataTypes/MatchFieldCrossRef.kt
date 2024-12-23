package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "match_field_cross_ref",
    primaryKeys = ["matchId", "fieldId"],
    foreignKeys = [
        ForeignKey(
            entity = MatchMVP::class,
            parentColumns = ["id"],
            childColumns = ["matchId"]
        ),
        ForeignKey(
            entity = Field::class,
            parentColumns = ["id"],
            childColumns = ["fieldId"]
        )
    ],
    indices = [
        Index("matchId"),
        Index("fieldId")
    ]
)
data class MatchFieldCrossRef(
    val matchId: String,
    val fieldId: String
)