package com.razumly.mvp.teamManagement

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackCallback
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import kotlinx.coroutines.Job
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TeamManagementLifecycleTest {

    @Test
    fun destroying_component_context_cancels_team_management_scope() {
        val lifecycle = activeLifecycle()
        val context = DefaultComponentContext(
            lifecycle = lifecycle,
            backHandler = BackDispatcher(),
        )
        val scope = context.teamManagementCoroutineScope()
        val scopeJob = checkNotNull(scope.coroutineContext[Job])

        assertTrue(scopeJob.isActive)
        lifecycle.onPause()
        lifecycle.onStop()
        lifecycle.onDestroy()

        assertFalse(scopeJob.isActive)
    }

    @Test
    fun destroying_team_management_unregisters_and_disables_editor_back_callback() {
        val backHandler = BackDispatcher()
        val callback = BackCallback(isEnabled = true) { }
        backHandler.register(callback)

        TeamManagementLifecycleCleanup(
            backHandler = backHandler,
            backCallback = callback,
        ).onDestroy()

        assertFalse(callback.isEnabled)
        assertFalse(backHandler.isRegistered(callback))
    }

    private fun activeLifecycle() = LifecycleRegistry().apply {
        onCreate()
        onStart()
        onResume()
    }
}
