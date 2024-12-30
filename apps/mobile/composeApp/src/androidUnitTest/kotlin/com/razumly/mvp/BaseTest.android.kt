package com.razumly.mvp

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.razumly.mvp.di.KoinInitializer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.Rule
import org.junit.rules.Timeout
import org.junit.runner.RunWith
import org.koin.core.context.stopKoin
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.BeforeTest

@RunWith(RobolectricTestRunner::class)
@OptIn(ExperimentalCoroutinesApi::class)
actual open class BaseTest {
    actual val testDispatcher = StandardTestDispatcher()
    private val applicationContext = ApplicationProvider.getApplicationContext<Context>()

    @BeforeTest
    actual fun setUp() {
        Dispatchers.setMain(testDispatcher)
        KoinInitializer(applicationContext).init()
    }

    @AfterTest
    actual fun tearDown() {
        stopKoin()
        Dispatchers.resetMain()
    }
}