package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.IPushNotificationsRepository
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.ErrorMessage

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
        title: String,
        message: String,
    ): ErrorMessage? {
        return sendEventNotificationRequest(eventId, title, message, true)
            .fold(
                onSuccess = { null },
                onFailure = { error ->
                    ErrorMessage("Failed to send message: ${error.userMessage()}")
                },
            )
    }
}
