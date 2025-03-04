package com.razumly.mvp

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest

@OptIn(ExperimentalCoroutinesApi::class)
actual open class BaseTest {
    val testDispatcher = StandardTestDispatcher()
//    private val applicationContext = ApplicationProvider.getApplicationContext<Context>()

    @BeforeTest
    actual fun setUp() {
        Dispatchers.setMain(testDispatcher)
//        KoinInitializer(applicationContext).init()
    }

    @AfterTest
    actual fun tearDown() {
//        stopKoin()
        Dispatchers.resetMain()
    }
}