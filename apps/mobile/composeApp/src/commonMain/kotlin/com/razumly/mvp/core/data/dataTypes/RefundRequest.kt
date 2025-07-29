package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity
@Serializable
data class RefundRequest(
    @PrimaryKey override val id: String,
    val eventId: String,
    val userId: String,
    val hostId: String,
    val reason: String,
    val isTournament: Boolean,
) : MVPDocument