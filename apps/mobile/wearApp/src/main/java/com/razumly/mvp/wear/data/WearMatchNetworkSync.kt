package com.razumly.mvp.wear.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

class WearMatchNetworkSync(
    context: Context,
    private val operationStore: WearMatchOperationStore,
    private val repository: WearMatchRepository,
) {
    private val applicationContext = context.applicationContext
    private val connectivityManager = applicationContext.getSystemService(ConnectivityManager::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val started = AtomicBoolean(false)
    private val syncing = AtomicBoolean(false)
    private var callback: ConnectivityManager.NetworkCallback? = null

    fun start() {
        if (!started.compareAndSet(false, true)) return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                drainIfPending("network available")
            }

            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                if (networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                    drainIfPending("network capabilities changed")
                }
            }
        }
        callback = networkCallback
        runCatching {
            connectivityManager.registerNetworkCallback(request, networkCallback)
        }.onFailure { error ->
            Log.w(TAG, "Unable to register network callback.", error)
        }
        if (connectivityManager.hasInternetCapability()) {
            drainIfPending("startup")
        }
    }

    fun stop() {
        callback?.let { networkCallback ->
            runCatching { connectivityManager.unregisterNetworkCallback(networkCallback) }
        }
        callback = null
        scope.cancel()
    }

    private fun ConnectivityManager.hasInternetCapability(): Boolean {
        val network = activeNetwork ?: return false
        val capabilities = getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun drainIfPending(reason: String) {
        if (operationStore.pendingOperations().isEmpty()) return
        if (!syncing.compareAndSet(false, true)) return
        scope.launch {
            try {
                if (operationStore.pendingOperations().isEmpty()) return@launch
                val count = repository.syncPendingOperations(null)
                Log.d(TAG, "Synced $count pending match operations after $reason.")
            } catch (error: Throwable) {
                Log.w(TAG, "Pending match operation sync failed after $reason.", error)
            } finally {
                syncing.set(false)
            }
        }
    }

    private companion object {
        private const val TAG = "WearMatchNetworkSync"
    }
}
