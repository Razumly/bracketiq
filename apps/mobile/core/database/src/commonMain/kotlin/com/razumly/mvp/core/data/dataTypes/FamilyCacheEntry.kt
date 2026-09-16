package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "family_cache")
data class FamilyCacheEntry(
    @PrimaryKey val parentId: String,
    val childrenJson: String,
)
