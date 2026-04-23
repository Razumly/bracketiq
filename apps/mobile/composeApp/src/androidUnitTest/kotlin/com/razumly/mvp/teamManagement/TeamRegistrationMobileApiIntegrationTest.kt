@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.teamManagement

import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.withSynchronizedMembership
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.testing.MOBILE_TEST_HOST_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_HOST_PASSWORD
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_PASSWORD
import com.razumly.mvp.testing.MobileApiTestSession
import com.razumly.mvp.testing.mobileApiLoginFixturesReady
import com.razumly.mvp.testing.runTargetedBackendSeed
import com.razumly.mvp.testing.shouldAutoSeedBackendFixtures
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.minutes

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TeamRegistrationMobileApiIntegrationTest {
    private var session: MobileApiTestSession? = null
    private var createdTeamId: String? = null

    @Before
    fun ensureBackendFixtures() {
        if (backendFixturesReady()) return

        val fixturesPrepared = if (shouldAutoSeedBackendFixtures()) {
            runCatching {
                runTargetedBackendSeed()
                backendFixturesReady()
            }.getOrDefault(false)
        } else {
            false
        }

        assumeTrue(
            "Skipping team registration mobile/backend integration test because seeded login fixtures are unavailable. " +
                "Automatic backend seeding is disabled unless MVP_TEST_ALLOW_DB_SEED=1.",
            fixturesPrepared,
        )
    }

    @After
    fun tearDown() {
        val createdId = createdTeamId
        if (!createdId.isNullOrBlank()) {
            runCatching { runBlocking { session?.deleteTeam(createdId) } }
        }
        session?.close()
        session = null
        createdTeamId = null
    }

    @Test
    fun paid_team_registration_update_without_connected_stripe_returns_backend_error() = runTest(timeout = 2.minutes) {
        session = MobileApiTestSession.create()
        val mobileSession = assertNotNull(session)

        val currentUser = loginWithNonStripeFixture(mobileSession)
        val createdTeam = mobileSession.teamRepository.createTeam(
            Team(currentUser.id).copy(
                name = "Mobile Paid Registration Guard",
                teamSize = 6,
            ).withSynchronizedMembership(),
        ).getOrThrow()
        createdTeamId = createdTeam.id

        val updateResult = mobileSession.teamRepository.updateTeam(
            createdTeam.copy(
                openRegistration = true,
                registrationPriceCents = 2_500,
            ).withSynchronizedMembership(),
        )

        assertTrue(updateResult.isFailure, "Expected paid registration save to fail without a connected Stripe account.")

        val failure = updateResult.exceptionOrNull()
        assertTrue(failure is ApiException, "Expected ApiException but got ${failure?.javaClass?.simpleName}")
        assertEquals(400, failure.statusCode)
        assertEquals(
            "Connect Stripe before setting a paid team registration cost.",
            failure.userMessage(),
        )
        assertTrue(
            failure.responseBody?.contains("Connect Stripe before setting a paid team registration cost.") == true,
            "Expected backend response body to include the Stripe requirement message.",
        )
    }

    private fun backendFixturesReady(): Boolean {
        return mobileApiLoginFixturesReady(
            MOBILE_TEST_HOST_EMAIL to MOBILE_TEST_HOST_PASSWORD,
            MOBILE_TEST_PARTICIPANT_EMAIL to MOBILE_TEST_PARTICIPANT_PASSWORD,
        )
    }

    private suspend fun loginWithNonStripeFixture(mobileSession: MobileApiTestSession): UserData {
        val candidates = listOf(
            MOBILE_TEST_HOST_EMAIL to MOBILE_TEST_HOST_PASSWORD,
            MOBILE_TEST_PARTICIPANT_EMAIL to MOBILE_TEST_PARTICIPANT_PASSWORD,
        )

        val selectedUser = candidates.firstNotNullOfOrNull { (email, password) ->
            mobileSession.userRepository.login(email, password)
                .getOrNull()
                ?.takeIf { user -> user.hasStripeAccount != true }
        }

        return requireNotNull(selectedUser) {
            "Expected at least one seeded mobile test user without a connected Stripe account."
        }
    }
}
