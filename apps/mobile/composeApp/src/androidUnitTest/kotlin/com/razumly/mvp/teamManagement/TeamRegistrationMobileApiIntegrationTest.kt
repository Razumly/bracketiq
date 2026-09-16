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
import com.razumly.mvp.testing.runBackendSeedThenCheck
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
import kotlinx.coroutines.flow.first
import java.net.URI
import java.net.URLDecoder

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class TeamRegistrationMobileApiIntegrationTest {
    private var session: MobileApiTestSession? = null
    private var createdTeamId: String? = null

    @Test
    fun givenSiblingsWithOneGuardianContact_whenInvitationsAreAccepted_thenRoomKeepsSeparateProfiles() = runTest(timeout = 5.minutes) {
        val mobile = MobileApiTestSession.create().also { session = it }
        val guardian = mobile.userRepository.login(MOBILE_TEST_HOST_EMAIL, MOBILE_TEST_HOST_PASSWORD).getOrThrow()
        val team = mobile.teamRepository.createTeam(Team(guardian.id).copy(
            name = "Guardian Acceptance Test", teamSize = 6,
        ).withSynchronizedMembership()).getOrThrow()
        createdTeamId = team.id
        val childIds = mutableSetOf<String>()
        for (name in listOf("Casey", "Jamie")) {
            val invitation = mobile.teamRepository.createTeamMemberInvite(
                teamId = team.id, firstName = name, lastName = "River", shareOnly = true,
                isMinor = true, dateOfBirth = "2015-01-01", guardianEmail = MOBILE_TEST_HOST_EMAIL,
            ).getOrThrow()
            val url = URI(assertNotNull(invitation.claimUrl))
            val fields = url.rawQuery.split('&').associate { field ->
                val pair = field.split('=', limit = 2)
                pair[0] to URLDecoder.decode(pair[1], "UTF-8")
            }
            val inviteId = url.path.substringAfterLast('/')
            val preview = mobile.userRepository.previewManagedPlayerClaim(inviteId, fields["v"], fields["e"], fields["s"]).getOrThrow()
            assertTrue(preview.isMinor)
            assertTrue(preview.guardianSetupRequired)
            assertTrue(childIds.add(preview.profileId), "Siblings must not share a Player profile")
            val result = mobile.userRepository.claimManagedPlayerProfile(
                profileId = preview.profileId, inviteId = inviteId, confirmation = true,
                version = fields["v"], expiresAt = fields["e"], signature = fields["s"],
                guardianDeclaration = true, acceptTeamInvitation = true,
            ).getOrThrow()
            assertEquals("GUARDIAN_ACCEPTED", result.status)
            assertEquals(preview.profileId, result.primaryProfileId)
            val retry = mobile.userRepository.claimManagedPlayerProfile(
                profileId = preview.profileId, inviteId = inviteId, confirmation = true,
                version = fields["v"], expiresAt = fields["e"], signature = fields["s"],
                guardianDeclaration = false, acceptTeamInvitation = true,
            ).getOrThrow()
            assertEquals("GUARDIAN_ACCEPTED", retry.status)
        }
        val cached = mobile.userRepository.observeChildren().first()
        assertTrue(cached.map { it.userId }.containsAll(childIds))
        assertEquals(guardian.id, mobile.userRepository.currentUser.value.getOrThrow().id)
    }

    @Before
    fun ensureBackendFixtures() {
        assumeTrue(
            "Skipping team registration mobile/backend integration test because MVP_TEST_BACKEND_URL is not set.",
            !System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank(),
        )
        if (backendFixturesReady()) return
        val fixturesPrepared = if (shouldAutoSeedBackendFixtures()) {
            runBackendSeedThenCheck(
                seed = { runTargetedBackendSeed() },
                fixturesReady = { backendFixturesReady() },
            )
        } else {
            false
        }

        assumeTrue(
            "Skipping team registration mobile/backend integration test because seeded login fixtures are unavailable. " +
                "Automatic backend seeding is disabled unless MVP_TEST_ALLOW_DB_SEED=1.",
            fixturesPrepared,
        )
    }

    @Test
    fun givenUnknownBirthdate_whenMinorBirthdateIsSubmitted_thenGuardianContactIsRequired() = runTest(timeout = 5.minutes) {
        val mobile = MobileApiTestSession.create().also { session = it }
        val manager = mobile.userRepository.login(MOBILE_TEST_HOST_EMAIL, MOBILE_TEST_HOST_PASSWORD).getOrThrow()
        val team = mobile.teamRepository.createTeam(Team(manager.id).copy(
            name = "Unknown Birthdate Test", teamSize = 6,
        ).withSynchronizedMembership()).getOrThrow()
        createdTeamId = team.id
        val invitation = mobile.teamRepository.createTeamMemberInvite(
            teamId = team.id, firstName = "Taylor", lastName = "River", shareOnly = true,
        ).getOrThrow()
        val url = URI(assertNotNull(invitation.claimUrl))
        val fields = url.rawQuery.split('&').associate { field ->
            val pair = field.split('=', limit = 2)
            pair[0] to URLDecoder.decode(pair[1], "UTF-8")
        }
        val inviteId = url.path.substringAfterLast('/')
        val initial = mobile.userRepository.previewManagedPlayerClaim(inviteId, fields["v"], fields["e"], fields["s"]).getOrThrow()
        assertTrue(initial.birthdateRequired)
        val result = mobile.userRepository.claimManagedPlayerProfile(
            profileId = initial.profileId, inviteId = inviteId, confirmation = true,
            dateOfBirth = "2015-01-01", version = fields["v"], expiresAt = fields["e"], signature = fields["s"],
        ).getOrThrow()
        assertEquals("GUARDIAN_REQUIRED", result.status)
        val refreshed = mobile.userRepository.previewManagedPlayerClaim(inviteId, fields["v"], fields["e"], fields["s"]).getOrThrow()
        assertTrue(refreshed.isMinor)
        assertTrue(refreshed.guardianContactRequired)
        val rejected = mobile.userRepository.claimManagedPlayerProfile(
            profileId = initial.profileId, inviteId = inviteId, confirmation = true,
            version = fields["v"], expiresAt = fields["e"], signature = fields["s"],
            guardianDeclaration = true, acceptTeamInvitation = true,
        )
        assertTrue(rejected.isFailure)
        assertEquals(manager.id, mobile.userRepository.currentUser.value.getOrThrow().id)
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
