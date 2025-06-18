package com.razumly.mvp

import com.razumly.mvp.di.KoinInitializer
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import org.kodein.mock.tests.TestsWithMocks
import org.koin.core.context.stopKoin
import kotlin.test.AfterTest
import kotlin.test.BeforeTest

actual open class ExceptBaseTest: TestsWithMocks() {
    override fun setUpMocks() = mocker.injectMocks(this)
    actual val testDispatcher = StandardTestDispatcher()
    @BeforeTest
    actual fun setUp() {
        KoinInitializer().init()
    }

    @AfterTest
    actual fun tearDown() {
        stopKoin()
    }

}