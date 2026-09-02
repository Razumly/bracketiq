package com.razumly.mvp

import com.mmk.kmpnotifier.notification.NotifierManager
import com.mmk.kmpnotifier.notification.PayloadData
import com.razumly.mvp.core.data.repositories.PushNotificationGateway
import com.razumly.mvp.core.data.repositories.PushNotificationListener

class KmpPushNotificationGateway : PushNotificationGateway {
    override fun registerListener(listener: PushNotificationListener) {
        NotifierManager.addListener(
            object : NotifierManager.Listener {
                override fun onNewToken(token: String) {
                    listener.onNewToken(token)
                }

                override fun onNotificationClicked(data: PayloadData) {
                    listener.onNotificationClicked(data.toStringPayloadMap())
                }

                override fun onPushNotificationWithPayloadData(
                    title: String?,
                    body: String?,
                    data: PayloadData,
                ) {
                    listener.onNotificationReceived(
                        title = title,
                        body = body,
                        data = data.toStringPayloadMap(),
                    )
                }
            },
        )
    }

    override suspend fun getPushToken(): String? =
        NotifierManager.getPushNotifier().getToken()

    override fun showLocalNotification(
        title: String,
        body: String,
        payload: Map<String, String>,
    ) {
        NotifierManager.getLocalNotifier().notify(
            title = title,
            body = body,
            payloadData = payload,
        )
    }
}

private fun PayloadData.toStringPayloadMap(): Map<String, String> =
    entries.mapNotNull { (key, value) ->
        val normalizedKey = key.trim()
        val normalizedValue = value?.toString()?.trim()?.takeIf(String::isNotBlank)
        if (normalizedKey.isBlank() || normalizedValue == null) {
            null
        } else {
            normalizedKey to normalizedValue
        }
    }.toMap()
