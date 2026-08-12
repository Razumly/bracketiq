package com.razumly.mvp.testing

import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class MobileApiIntegrationSupportTest {
    @Test
    fun seed_failure_does_not_probe_fixture_readiness() {
        var fixturesChecked = false

        val prepared = runBackendSeedThenCheck(
            seed = { error("seed unavailable") },
            fixturesReady = {
                fixturesChecked = true
                true
            },
        )

        assertFalse(prepared)
        assertFalse(fixturesChecked)
    }

    @Test
    fun post_seed_fixture_contract_failure_is_not_swallowed() {
        val failure = assertFailsWith<AssertionError> {
            runBackendSeedThenCheck(
                seed = {},
                fixturesReady = { throw AssertionError("editor contract mismatch") },
            )
        }

        assertEquals("editor contract mismatch", failure.message)
    }

    @Test
    fun successful_seed_checks_fixture_readiness() {
        var fixturesChecked = false

        val prepared = runBackendSeedThenCheck(
            seed = {},
            fixturesReady = {
                fixturesChecked = true
                true
            },
        )

        assertTrue(prepared)
        assertTrue(fixturesChecked)
    }
}
