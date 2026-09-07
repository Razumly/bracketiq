@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.core.network.dto

import com.razumly.mvp.core.data.dataTypes.Event

/** Apply the participant header. Its selected nullable fields can clear stored values. */
fun EventApiDto.mergeParticipantHeader(base: Event): Event {
    require(id == base.id) { "The participant snapshot belongs to another Event." }
    val header = copy(
        name = name ?: base.name,
        hostId = hostId ?: base.hostId,
        start = start ?: base.start.toString(),
        end = end ?: base.end.toString(),
        timeZone = timeZone ?: base.timeZone,
    ).toEventOrNull(requireOwnerIdentity = false) ?: error("The participant Event header is invalid.")
    return base.copy(
        name = name?.let { header.name } ?: base.name,
        state = state?.let { header.state } ?: base.state,
        hostId = hostId ?: base.hostId,
        assistantHostIds = assistantHostIds ?: base.assistantHostIds,
        organizationId = header.organizationId,
        teamSignup = teamSignup ?: base.teamSignup,
        singleDivision = singleDivision ?: base.singleDivision,
        maxParticipants = header.maxParticipants,
        eventType = eventType?.let { header.eventType } ?: base.eventType,
        registrationPaymentMode = header.registrationPaymentMode,
        manualPaymentLinks = header.manualPaymentLinks,
        manualPaymentInstructions = header.manualPaymentInstructions,
        timeSlotIds = timeSlotIds ?: base.timeSlotIds,
        start = start?.let { header.start } ?: base.start,
        end = end?.let { header.end } ?: base.end,
        archivedAt = header.archivedAt,
    )
}
