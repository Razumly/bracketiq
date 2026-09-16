package com.razumly.mvp.core.data.repositories

interface PushNotificationGateway {
    fun registerListener(listener: PushNotificationListener)

    suspend fun getPushToken(): String?

    fun showLocalNotification(
        title: String,
        body: String,
        payload: Map<String, String>,
    )
}

interface PushNotificationListener {
    fun onNewToken(token: String)

    fun onNotificationClicked(data: Map<String, String>)

    fun onNotificationReceived(
        title: String?,
        body: String?,
        data: Map<String, String>,
    )
}
