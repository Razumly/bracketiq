package com.razumly.mvp

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.razumly.mvp.di.KoinInitializer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.runner.RunWith
import org.kodein.mock.generated.injectMocks
import org.kodein.mock.tests.TestsWithMocks
import org.koin.core.context.GlobalContext.stopKoin
import org.robolectric.RobolectricTestRunner
import kotlin.test.AfterTest
import kotlin.test.BeforeTest

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
actual open class ExceptBaseTest: TestsWithMocks() {
    actual val testDispatcher = StandardTestDispatcher()

    @BeforeTest
    actual fun setUp() {
        Dispatchers.setMain(testDispatcher)
        val context = ApplicationProvider.getApplicationContext<Context>()
        KoinInitializer(context).init()
    }

    @AfterTest
    actual fun tearDown() {
        stopKoin()
        Dispatchers.resetMain()
    }

    override fun setUpMocks() = mocker.injectMocks(this)
}