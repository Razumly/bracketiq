package com.razumly.mvp.eventMap

import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.backhandler.BackDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class MapComponentCleanupTest {

    @Test
    fun destroy_cancels_collectors_stops_tracking_and_unregisters_back_callback() {
        val job = Job()
        val backHandler = BackDispatcher()
        val backCallback = BackCallback { }
        backHandler.register(backCallback)
        var stopTrackingCalls = 0

        MapComponentCleanup(
            scope = CoroutineScope(job),
            backHandler = backHandler,
            backCallback = backCallback,
            stopLocationTracking = { stopTrackingCalls += 1 },
        ).onDestroy()

        assertFalse(job.isActive)
        assertEquals(1, stopTrackingCalls)
        assertFalse(backHandler.isRegistered(backCallback))
    }

    @Test
    fun destroy_unregisters_callback_even_when_stopping_location_tracking_fails() {
        val job = Job()
        val backHandler = BackDispatcher()
        val backCallback = BackCallback { }
        backHandler.register(backCallback)

        MapComponentCleanup(
            scope = CoroutineScope(job),
            backHandler = backHandler,
            backCallback = backCallback,
            stopLocationTracking = { error("location tracker unavailable") },
        ).onDestroy()

        assertFalse(job.isActive)
        assertFalse(backHandler.isRegistered(backCallback))
    }
}
