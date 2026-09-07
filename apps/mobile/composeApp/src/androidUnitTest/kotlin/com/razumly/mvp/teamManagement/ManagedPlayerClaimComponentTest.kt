package com.razumly.mvp.teamManagement

import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.ManagedPlayerClaimPreview
import com.razumly.mvp.core.data.repositories.ManagedPlayerClaimResult
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class ManagedPlayerClaimComponentTest {
    private val preview = ManagedPlayerClaimPreview(
        available = true, inviteId = "invite", profileId = "profile", displayName = "Alex Morgan",
        hasAttachedEmail = false, isMinor = false, teamId = "team", teamName = "River Crew",
    )

    @Test
    fun givenUnconfirmedPreview_whenClaimRequested_thenNoIdentityWriteOccurs() = runTest {
        val repository = mockk<IUserRepository>()
        coEvery { repository.previewManagedPlayerClaim("invite", "1", "expiry", "signature") } returns Result.success(preview)
        val component = ManagedPlayerClaimComponent(repository, "invite", "1", "expiry", "signature", this) {}
        try {
            component.load()
            component.claim()
            runCurrent()
            coVerify(exactly = 0) { repository.claimManagedPlayerProfile(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
            assertFalse(component.saving)
        } finally { component.close() }
    }

    @Test
    fun givenFailedClaim_whenRetried_thenKeepsConfirmationAndBirthdate() = runTest {
        val repository = mockk<IUserRepository>()
        coEvery { repository.previewManagedPlayerClaim(any(), any(), any(), any()) } returns Result.success(preview)
        coEvery { repository.claimManagedPlayerProfile("profile", "invite", true, "1990-01-01", "1", "expiry", "signature", null, null, null) } returnsMany listOf(
            Result.failure(IllegalStateException("Connection lost")), Result.success(ManagedPlayerClaimResult(status = "CLAIMED")),
        )
        var completed = 0
        val component = ManagedPlayerClaimComponent(repository, "invite", "1", "expiry", "signature", this) { completed += 1 }
        try {
            component.load()
            component.confirmed = true
            component.dateOfBirth = "1990-01-01"
            component.claim()
            runCurrent()
            assertEquals("Connection lost", component.error)
            assertTrue(component.confirmed)
            assertEquals("1990-01-01", component.dateOfBirth)
            component.claim()
            runCurrent()
            assertEquals(1, completed)
            assertNull(component.error)
        } finally { component.close() }
    }

    @Test
    fun givenPendingClaim_whenScreenCloses_thenLateResultCannotNavigate() = runTest {
        val repository = mockk<IUserRepository>()
        val response = CompletableDeferred<Result<ManagedPlayerClaimResult>>()
        coEvery { repository.previewManagedPlayerClaim(any(), any(), any(), any()) } returns Result.success(preview)
        coEvery { repository.claimManagedPlayerProfile(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } coAnswers { response.await() }
        var completed = 0
        val component = ManagedPlayerClaimComponent(repository, "invite", "1", "expiry", "signature", this) { completed += 1 }
        component.load()
        component.confirmed = true
        component.claim()
        runCurrent()
        component.close()
        response.complete(Result.success(ManagedPlayerClaimResult(status = "CLAIMED")))
        runCurrent()
        assertNull(component.preview)
        assertEquals(0, completed)
    }
}
