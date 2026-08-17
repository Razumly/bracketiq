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

@OptIn(ExperimentalCoroutinesApi::class)
class ChatRefreshLifecycleTest {
    @Test
    fun refresh_runsOncePerForegroundSession_withoutPeriodicPolling() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val lifecycleRegistry = LifecycleRegistry()
        val lifecycleOwner = object : LifecycleOwner {
            override val lifecycle: Lifecycle = lifecycleRegistry
        }
        var isActiveUser = true
        var refreshCount = 0

        val refreshJob = launch {
            lifecycleOwner.repeatChatRefreshOnForeground(
                isActiveUser = { isActiveUser },
                refresh = { refreshCount += 1 },
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

        advanceTimeBy(5 * 60_000L)
        runCurrent()
        assertEquals(1, refreshCount)

        lifecycleRegistry.onStop()
        runCurrent()
        lifecycleRegistry.onStart()
        runCurrent()
        assertEquals(2, refreshCount)

        isActiveUser = false
        lifecycleRegistry.onStop()
        runCurrent()
        lifecycleRegistry.onStart()
        runCurrent()
        assertEquals(2, refreshCount)

        lifecycleRegistry.onStop()
        lifecycleRegistry.onDestroy()
        refreshJob.join()
    }
}
