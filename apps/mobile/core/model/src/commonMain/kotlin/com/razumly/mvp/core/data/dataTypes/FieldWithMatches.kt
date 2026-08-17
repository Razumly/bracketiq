package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation
import com.razumly.mvp.core.data.dataTypes.crossRef.FieldMatchCrossRef

data class FieldWithMatches(
    @Embedded
    val field: Field,

    @Relation(
        parentColumn = "id",
        entityColumn = "fieldId",
        entity = MatchMVP::class
    )
    val matches: List<MatchMVP>
)
