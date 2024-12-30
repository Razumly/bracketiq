package com.razumly.mvp

import kotlin.test.AfterTest
import kotlin.test.BeforeTest

actual open class BaseTest {
    @BeforeTest
    actual fun setUp() {
    }

    @AfterTest
    actual fun tearDown() {
    }

}