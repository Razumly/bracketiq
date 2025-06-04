package com.razumly.mvp.core.data.dataTypes.crossRef

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.MatchMVP

@Entity(
    tableName = "field_match_cross_ref",
    primaryKeys = ["fieldId", "matchId"],
    foreignKeys = [
        ForeignKey(
            entity = MatchMVP::class,
            parentColumns = ["id"],
            childColumns = ["matchId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = Field::class,
            parentColumns = ["id"],
            childColumns = ["fieldId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index("fieldId"),
        Index("matchId")
    ]
)
data class FieldMatchCrossRef(
    val fieldId: String,
    val matchId: String
)