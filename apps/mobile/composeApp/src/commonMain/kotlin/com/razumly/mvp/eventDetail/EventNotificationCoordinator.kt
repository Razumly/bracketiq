package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.network.userMessage

internal class EventNotificationCoordinator(
    private val sendEventNotificationRequest: suspend (
        eventId: String,
        title: String,
        body: String,
        isTournament: Boolean,
    ) -> Result<Unit>,
) {
    constructor(
        notificationsRepository: IPushNotificationsRepository,
    ) : this(notificationsRepository::sendEventNotification)

    suspend fun sendEventNotification(
        eventId: String,
        eventType: EventType,
        title: String,
        message: String,
    ): Result<Unit> {
        return sendEventNotificationRequest(
            eventId,
            title,
            message,
            eventType == EventType.TOURNAMENT,
        )
            .fold(
                onSuccess = { Result.success(Unit) },
                onFailure = { error ->
                    Result.failure(
                        IllegalStateException("Failed to send message: ${error.userMessage()}"),
                    )
                },
            )
    }
}
