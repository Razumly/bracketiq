package com.razumly.mvp

import kotlin.test.AfterTest
import kotlin.test.BeforeTest

expect open class BaseTest() {
    @BeforeTest
    fun setUp()

    @AfterTest
    fun tearDown()
}