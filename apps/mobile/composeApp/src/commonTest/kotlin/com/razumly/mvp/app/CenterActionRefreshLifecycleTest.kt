package com.razumly.mvp.app

import com.arkivanov.essenty.lifecycle.Lifecycle
import com.arkivanov.essenty.lifecycle.LifecycleOwner
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class CenterActionRefreshLifecycleTest {
    @Test
    fun refreshLoop_runsOnlyWhileStarted_andRefreshesImmediatelyAfterRestart() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val lifecycleRegistry = LifecycleRegistry()
        val lifecycleOwner = object : LifecycleOwner {
            override val lifecycle: Lifecycle = lifecycleRegistry
        }
        var isActiveUser = true
        var refreshCount = 0
        var inactiveCount = 0

        val refreshJob = launch {
            lifecycleOwner.repeatCenterActionRefreshWhileStarted(
                isActiveUser = { isActiveUser },
                refresh = { refreshCount += 1 },
                onInactive = { inactiveCount += 1 },
                refreshIntervalMillis = 1_000,
                context = dispatcher,
            )
        }
        runCurrent()

        lifecycleRegistry.onCreate()
        runCurrent()
        assertEquals(0, refreshCount)

        lifecycleRegistry.onStart()
        runCurrent()
        assertEquals(1, refreshCount)

        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(2, refreshCount)
        assertEquals(0, inactiveCount)

        lifecycleRegistry.onStop()
        runCurrent()
        advanceTimeBy(5_000)
        runCurrent()
        assertEquals(2, refreshCount)

        lifecycleRegistry.onStart()
        runCurrent()
        assertEquals(3, refreshCount)

        isActiveUser = false
        advanceTimeBy(1_000)
        runCurrent()
        assertEquals(2, inactiveCount)
        lifecycleRegistry.onStop()
        lifecycleRegistry.onDestroy()
        refreshJob.join()
    }

    @Test
    fun requestTracker_rejectsSupersededAndInvalidatedResponses() {
        val tracker = CenterActionRefreshRequestTracker()

        val firstRequest = tracker.begin()
        val secondRequest = tracker.begin()

        assertFalse(tracker.isCurrent(firstRequest))
        assertTrue(tracker.isCurrent(secondRequest))

        tracker.invalidate()

        assertFalse(tracker.isCurrent(secondRequest))
    }
}
