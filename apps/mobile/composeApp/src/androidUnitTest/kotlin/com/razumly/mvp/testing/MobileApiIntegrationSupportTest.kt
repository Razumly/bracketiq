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

    @Test
    fun given_database_url_with_target_override_when_validated_then_rejected() {
        val overrideParameters = listOf(
            "host",
            "hostaddr",
            "port",
            "socket",
            "connectionString",
            "%68ost",
        )

        overrideParameters.forEach { parameter ->
            val value = if (parameter == "connectionString") {
                "postgresql%3A%2F%2Fu%3Ap%40remote%2Fprod"
            } else {
                "remote.example"
            }
            assertFailsWith<IllegalArgumentException> {
                validateLocalTestDatabaseUrl(
                    "postgresql://mvp:mvp_password@127.0.0.1:5433/mvp_test?$parameter=$value",
                )
            }
        }
    }

    @Test
    fun given_database_url_with_schema_query_when_validated_then_accepted() {
        val raw = "postgresql://mvp:mvp_password@127.0.0.1:5433/mvp_test?schema=public"

        assertEquals(raw, validateLocalTestDatabaseUrl(raw))
    }
}
