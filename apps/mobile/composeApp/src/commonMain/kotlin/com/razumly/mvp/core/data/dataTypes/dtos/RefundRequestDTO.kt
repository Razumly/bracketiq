package com.razumly.mvp.core.data.dataTypes.dtos

import com.razumly.mvp.core.data.dataTypes.RefundRequest
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class RefundRequestDTO(
    @Transient val id: String = "",
    val eventId: String,
    val userId: String,
    val hostId: String,
    val reason: String,
    val isTournament: Boolean,
) {
    fun toRefundRequest(id: String): RefundRequest {
        return RefundRequest(
            id = id,
            eventId = eventId,
            userId = userId,
            hostId = hostId,
            reason = reason,
            isTournament = isTournament
        )
    }
}