package com.razumly.mvp.wear

import android.app.Application
import com.razumly.mvp.wear.data.WearApiClient
import com.razumly.mvp.wear.data.WearAuthTokenStore
import com.razumly.mvp.wear.data.WearMatchNetworkSync
import com.razumly.mvp.wear.data.WearMatchOperationStore
import com.razumly.mvp.wear.data.WearMatchPhoneSync
import com.razumly.mvp.wear.data.WearMatchRepository

class MvpWearApplication : Application() {
    private var networkSync: WearMatchNetworkSync? = null

    override fun onCreate() {
        super.onCreate()
        val tokenStore = WearAuthTokenStore(applicationContext)
        val operationStore = WearMatchOperationStore(applicationContext)
        val repository = WearMatchRepository(
            api = WearApiClient(tokenStore),
            tokenStore = tokenStore,
            operationStore = operationStore,
            phoneSync = WearMatchPhoneSync(applicationContext),
        )
        networkSync = WearMatchNetworkSync(
            context = applicationContext,
            operationStore = operationStore,
            repository = repository,
        ).also { it.start() }
    }
}
