package com.razumly.mvp.core.presentation

import com.arkivanov.decompose.DefaultComponentContext
import com.arkivanov.essenty.backhandler.BackDispatcher
import com.arkivanov.essenty.lifecycle.LifecycleRegistry
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.util.LoadingHandler
import com.razumly.mvp.core.util.LoadingHandlerImpl
import com.razumly.mvp.core.util.LoadingOperation
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

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

    @Test
    fun overlapping_actions_keep_loading_until_each_owner_finishes() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val followResult = CompletableDeferred<Result<Unit>>()
            val unfollowResult = CompletableDeferred<Result<Unit>>()
            val userRepository = mockk<IUserRepository>()
            coEvery { userRepository.followUser(TEST_USER.id) } coAnswers { followResult.await() }
            coEvery { userRepository.unfollowUser(TEST_USER.id) } coAnswers { unfollowResult.await() }
            val loadingHandler = LoadingHandlerImpl()
            val component = createComponent(userRepository).apply {
                setLoadingHandler(loadingHandler)
            }

            component.followUser(TEST_USER)
            component.unfollowUser(TEST_USER)
            runCurrent()

            assertTrue(loadingHandler.loadingState.value.isLoading)
            assertEquals(2, loadingHandler.loadingState.value.activeOperationCount)
            assertEquals("Following User ...", loadingHandler.loadingState.value.message)

            followResult.complete(Result.success(Unit))
            runCurrent()

            assertTrue(loadingHandler.loadingState.value.isLoading)
            assertEquals(1, loadingHandler.loadingState.value.activeOperationCount)
            assertEquals("Unfollowing User ...", loadingHandler.loadingState.value.message)

            unfollowResult.complete(Result.success(Unit))
            advanceUntilIdle()

            assertFalse(loadingHandler.loadingState.value.isLoading)
            assertEquals(0, loadingHandler.loadingState.value.activeOperationCount)
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
        private val delegate = LoadingHandlerImpl()
        override val loadingState = delegate.loadingState
        val events = mutableListOf<String>()

        override fun newOperation(): LoadingOperation {
            val operation = delegate.newOperation()
            return object : LoadingOperation {
                override fun showLoading(message: String, progress: Float?) {
                    events += "show:$message"
                    operation.showLoading(message, progress)
                }

                override fun hideLoading() {
                    events += "hide"
                    operation.hideLoading()
                }

                override fun updateProgress(progress: Float) {
                    operation.updateProgress(progress)
                }
            }
        }
    }

    private companion object {
        val TEST_USER = UserData().copy(
            id = "player-1",
            userName = "player",
        )
    }
}
