package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Junction
import androidx.room.Relation

data class FieldWithMatches(
    @Embedded
    val field: Field,
    @Relation(
        parentColumn = "id",
        entityColumn = "field"
    )
    val matches: List<MatchMVP>  // Changed to MatchMVP instead of MatchWithRelations
)