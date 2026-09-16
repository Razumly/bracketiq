package com.razumly.mvp.eventDetail

import com.razumly.mvp.testing.MobileApiTestSession
import com.razumly.mvp.core.util.newId
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.test.runTest
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.minutes

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ChildCheckoutMobileApiIntegrationTest {
    private fun fixture(action: String, id: String) {
        val directory = System.getenv("MVP_SITE_DIR")?.let(::File)
            ?: listOf(File("../site"), File("../../site")).first { File(it, "package.json").isFile }
        val output = File.createTempFile("child-checkout-", ".log")
        try {
            val process = ProcessBuilder("node", "node_modules/tsx/dist/cli.mjs", "scripts/test-child-checkout-fixtures.ts", action, id)
                .directory(directory).redirectErrorStream(true).redirectOutput(output).start()
            check(process.waitFor(90, TimeUnit.SECONDS)) { "Child checkout fixture timed out." }
            check(process.exitValue() == 0) { output.readText() }
        } finally { output.delete() }
    }

    @Test
    fun given_child_checkout_when_mobile_submits_then_site_preserves_registrant_division_and_answers() = runTest(timeout = 10.minutes) {
        assumeTrue("Set MVP_TEST_BACKEND_URL for the real site check.", !System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank())
        val id = "checkout-child-${newId()}"
        val mobile = MobileApiTestSession.create()
        try {
            fixture("seed", id)
            mobile.userRepository.login("$id-parent@example.test", "password123!").getOrThrow()
            val children = mobile.userRepository.listChildren().getOrThrow()
            assertEquals("$id-child", children.single().userId)
            val event = mobile.eventRepository.getEvent(id).getOrThrow()
            val divisionId = "${id}__division__c_skill_open_age_u12"
            assertTrue(event.divisionDetails.any { it.id == divisionId })
            val child = children.single()
            assertTrue(isChildEligibleForEvent(
                JoinChildOption(child.userId, "Avery Rivera", child.email, child.hasEmail == true, dateOfBirth = child.dateOfBirth),
                event, divisionId,
            ))
            val result = mobile.eventRepository.registerChildForEvent(id, "$id-child", false, null,
                divisionId, mapOf("$id-question" to "Family car")).getOrThrow()
            assertEquals("active", result.registrationStatus?.lowercase())
            fixture("verify", id)
        } finally {
            mobile.close()
            fixture("cleanup", id)
        }
    }
}
