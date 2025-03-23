package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.FieldMatchCrossRef

data class FieldWithMatches(
    @Embedded
    val field: Field,

    @Relation(
        parentColumn = "matches",
        entityColumn = "id",
        associateBy = Junction(
            value = FieldMatchCrossRef::class,
            parentColumn = "fieldId",
            entityColumn = "matchId"
        )
    )
    val matches: List<MatchMVP>  // Changed to MatchMVP instead of MatchWithRelations
)