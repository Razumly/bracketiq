package com.razumly.mvp

import assertk.Assert
import assertk.assertions.support.expected
import assertk.assertions.support.show
import kotlinx.coroutines.test.TestDispatcher
import org.kodein.mock.tests.TestsWithMocks
import kotlin.test.AfterTest
import kotlin.test.BeforeTest

expect open class ExceptBaseTest(): TestsWithMocks{
    val testDispatcher: TestDispatcher
    @BeforeTest
    fun setUp()

    @AfterTest
    fun tearDown()
}

open class BaseTest : ExceptBaseTest() {
    fun <T> Assert<Result<T>>.isSuccess() = given { actual ->
        if (actual.isFailure) {
            expected("${show(actual)} to be Result.success")
        }
    }

    fun <T> Assert<Result<T>>.isFailure() = given { actual ->
        if (actual.isSuccess) {
            expected("${show(actual)} to be Result.failure")
        }
    }

    fun <T> Assert<Result<T>>.isSuccessAnd(): Assert<T> = transform { actual ->
        if (actual.isSuccess) {
            actual.getOrThrow()
        } else {
            expected("${show(actual)} to be Result.success")
        }
    }

    fun <T> Assert<Result<T>>.isFailureAnd(): Assert<Throwable> = transform { actual ->
        if (actual.isFailure) {
            actual.exceptionOrNull()!!
        } else {
            expected("${show(actual)} to be Result.failure")
        }
    }
}