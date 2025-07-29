package com.razumly.mvp.core.data.dataTypes

import androidx.room.Embedded
import androidx.room.Relation
import kotlinx.serialization.Serializable

@Serializable
data class RefundRequestWithRelations(
    @Embedded val refundRequest: RefundRequest,

    @Relation(
        parentColumn = "userId",
        entityColumn = "id"
    )
    val user: UserData?,

    @Relation(
        parentColumn = "eventId",
        entityColumn = "id"
    )
    val event: EventImp?,

    @Relation(
        parentColumn = "eventId",
        entityColumn = "id"
    )
    val tournament: Tournament?
) {
    val eventAbs: EventAbs?
        get() = event ?: tournament
}
