package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingState
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class PlayerInteractionComponentTest {

    @Test
    fun action_without_loading_handler_completes_without_crashing() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val userRepository = mockk<IUserRepository>()
            coEvery { userRepository.followUser(TEST_USER.id) } returns Result.success(Unit)
            val component = createComponent(userRepository)

            component.followUser(TEST_USER)
            advanceUntilIdle()

            coVerify(exactly = 1) { userRepository.followUser(TEST_USER.id) }
            assertNull(component.errorState.value)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun result_failure_reports_error_and_hides_loading() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val userRepository = mockk<IUserRepository>()
            coEvery { userRepository.followUser(TEST_USER.id) } returns
                Result.failure(IllegalStateException("Unable to follow player."))
            val loadingHandler = RecordingLoadingHandler()
            val component = createComponent(userRepository).apply {
                setLoadingHandler(loadingHandler)
            }

            component.followUser(TEST_USER)
            advanceUntilIdle()

            assertEquals(listOf("show:Following User ...", "hide"), loadingHandler.events)
            assertEquals("Unable to follow player.", component.errorState.value?.message)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun thrown_repository_failure_reports_error_and_hides_loading() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val userRepository = mockk<IUserRepository>()
            coEvery { userRepository.followUser(TEST_USER.id) } throws
                IllegalStateException("Repository unexpectedly failed.")
            val loadingHandler = RecordingLoadingHandler()
            val component = createComponent(userRepository).apply {
                setLoadingHandler(loadingHandler)
            }

            component.followUser(TEST_USER)
            advanceUntilIdle()

            assertEquals(listOf("show:Following User ...", "hide"), loadingHandler.events)
            assertEquals("Repository unexpectedly failed.", component.errorState.value?.message)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun cancellation_hides_loading_without_reporting_an_error() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val userRepository = mockk<IUserRepository>()
            coEvery { userRepository.followUser(TEST_USER.id) } returns
                Result.failure(CancellationException("Canceled"))
            val loadingHandler = RecordingLoadingHandler()
            val component = createComponent(userRepository).apply {
                setLoadingHandler(loadingHandler)
            }

            component.followUser(TEST_USER)
            advanceUntilIdle()

            assertEquals(listOf("show:Following User ...", "hide"), loadingHandler.events)
            assertNull(component.errorState.value)
        } finally {
            Dispatchers.resetMain()
        }
    }

    private fun createComponent(userRepository: IUserRepository): DefaultPlayerInteractionComponent {
        val lifecycle = LifecycleRegistry().apply {
            onCreate()
            onStart()
            onResume()
        }
        return DefaultPlayerInteractionComponent(
            componentContext = DefaultComponentContext(
                lifecycle = lifecycle,
                backHandler = BackDispatcher(),
            ),
            userRepository = userRepository,
        )
    }

    private class RecordingLoadingHandler : LoadingHandler {
        private val state = MutableStateFlow(LoadingState())
        override val loadingState: StateFlow<LoadingState> = state
        val events = mutableListOf<String>()

        override fun showLoading(message: String, progress: Float?) {
            events += "show:$message"
            state.value = LoadingState(isLoading = true, message = message, progress = progress)
        }

        override fun hideLoading() {
            events += "hide"
            state.value = LoadingState()
        }

        override fun updateProgress(progress: Float) {
            state.value = state.value.copy(progress = progress)
        }
    }

    private companion object {
        val TEST_USER = UserData().copy(
            id = "player-1",
            userName = "player",
        )
    }
}
