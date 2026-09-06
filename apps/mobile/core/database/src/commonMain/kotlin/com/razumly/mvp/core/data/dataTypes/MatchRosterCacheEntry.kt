package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity

@Entity(tableName = "match_roster_cache", primaryKeys = ["accountId", "eventId", "matchId"])
data class MatchRosterCacheEntry(
    val accountId: String,
    val eventId: String,
    val matchId: String,
    val payloadJson: String,
)
