package com.razumly.mvp.core.auth

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.razumly.mvp.core.data.DatabaseService
import com.razumly.mvp.eventDetail.data.IMatchRepository
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.koin.core.context.GlobalContext
import java.util.concurrent.atomic.AtomicBoolean

object MatchOperationNetworkSync {
    private const val TAG = "MatchOperationNetworkSync"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val started = AtomicBoolean(false)
    private val syncing = AtomicBoolean(false)

    fun start(context: Context) {
        if (!started.compareAndSet(false, true)) return
        val appContext = context.applicationContext
        val connectivityManager = appContext.getSystemService(ConnectivityManager::class.java)
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                drainIfPending("network available")
            }

            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                if (networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                    drainIfPending("network capabilities changed")
                }
            }
        }

        runCatching {
            connectivityManager.registerNetworkCallback(request, callback)
        }.onFailure { error ->
            Napier.w(tag = TAG, throwable = error) { "Unable to register network callback." }
        }

        if (connectivityManager.hasInternetCapability()) {
            drainIfPending("startup")
        }
    }

    private fun ConnectivityManager.hasInternetCapability(): Boolean {
        val network = activeNetwork ?: return false
        val capabilities = getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun drainIfPending(reason: String) {
        if (!syncing.compareAndSet(false, true)) return
        scope.launch {
            try {
                val koin = GlobalContext.getOrNull() ?: return@launch
                val databaseService = koin.get<DatabaseService>()
                if (databaseService.getMatchOperationOutboxDao.pendingOperationCount() == 0) {
                    return@launch
                }
                val repository = koin.get<IMatchRepository>()
                repository.syncPendingMatchOperations(null)
                    .onSuccess { count ->
                        Napier.d(tag = TAG) { "Synced $count pending match operations after $reason." }
                    }
                    .onFailure { error ->
                        Napier.w(tag = TAG, throwable = error) {
                            "Pending match operation sync failed after $reason."
                        }
                    }
            } catch (error: Throwable) {
                Napier.w(tag = TAG, throwable = error) { "Unable to drain pending match operations." }
            } finally {
                syncing.set(false)
            }
        }
    }
}
