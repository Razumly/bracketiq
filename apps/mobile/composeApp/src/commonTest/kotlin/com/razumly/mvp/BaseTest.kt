package com.razumly.mvp

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlin.test.AfterTest
import kotlin.test.BeforeTest

expect open class BaseTest() {
    val testDispatcher: TestDispatcher
    @BeforeTest
    fun setUp()

    @AfterTest
    fun tearDown()
}