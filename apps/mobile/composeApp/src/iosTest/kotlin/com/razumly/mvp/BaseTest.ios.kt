package com.razumly.mvp

import com.razumly.mvp.di.KoinInitializer
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.koin.core.context.stopKoin
import kotlin.test.AfterTest
import kotlin.test.BeforeTest

actual open class BaseTest {

    @BeforeTest
    actual fun setUp() {
        KoinInitializer().init()
    }

    @AfterTest
    actual fun tearDown() {
        stopKoin()
    }

}