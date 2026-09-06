@file:OptIn(kotlin.time.ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.EventSignupDraft
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.network.dto.EventRegistrationDraftResponseDto
import com.razumly.mvp.core.util.jsonMVP
import com.razumly.mvp.core.util.newId
import com.razumly.mvp.testing.MOBILE_TEST_HOST_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_HOST_PASSWORD
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_EMAIL
import com.razumly.mvp.testing.MOBILE_TEST_PARTICIPANT_PASSWORD
import com.razumly.mvp.testing.MobileApiTestSession
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class EventSignupMobileApiIntegrationTest {
    private fun site(action: String, eventId: String, teamId: String? = null): String {
        val directory = System.getenv("MVP_SITE_DIR")?.let(::File)
            ?: listOf(File("../site"), File("../../site")).first { File(it, "package.json").isFile }
        val output = File.createTempFile("issue151-site-", ".log")
        try {
            val command = mutableListOf("node", "node_modules/tsx/dist/cli.mjs", "scripts/test-event-signup-fixtures.ts", action, eventId)
            teamId?.let(command::add)
            val process = ProcessBuilder(command).directory(directory).redirectErrorStream(true).redirectOutput(output).start()
            check(process.waitFor(90, TimeUnit.SECONDS)) { "The site fixture did not finish." }
            check(process.exitValue() == 0) { output.readText() }
            return output.readLines().lastOrNull { it.startsWith("{") }.orEmpty()
        } finally { output.delete() }
    }

    @Test
    fun givenSavedPreparation_whenSiteAndMobileResume_thenBothUseTheSameDraftAndMobileReadsRoom() = runTest(timeout = 10.minutes) {
        assumeTrue("Set MVP_TEST_BACKEND_URL to run the real site contract.", !System.getenv("MVP_TEST_BACKEND_URL").isNullOrBlank())
        val eventId = "issue151-${newId()}"
        site("seed", eventId)
        val mobile = MobileApiTestSession.create()
        val secondDevice = MobileApiTestSession.create()
        val otherAccount = MobileApiTestSession.create()
        var teamId: String? = null
        try {
            val owner = mobile.userRepository.login(MOBILE_TEST_HOST_EMAIL, MOBILE_TEST_HOST_PASSWORD).getOrThrow()
            secondDevice.userRepository.login(MOBILE_TEST_HOST_EMAIL, MOBILE_TEST_HOST_PASSWORD).getOrThrow()
            otherAccount.userRepository.login(MOBILE_TEST_PARTICIPANT_EMAIL, MOBILE_TEST_PARTICIPANT_PASSWORD).getOrThrow()
            val initial = mobile.eventRepository.loadRegistrationDraft(eventId).getOrThrow()
            assertNull(initial.draft)
            val team = Team(owner.id).copy(name = "Issue 151 River Crew", sport = "Indoor Volleyball", teamSize = 8)
            teamId = team.id
            val preparation = mobile.eventRepository.saveRegistrationDraft(eventId, null, 0,
                EventSignupDraft(id = "", eventId = eventId, revision = 0, teamCreationId = team.id, step = "team", updatedAt = Clock.System.now().toString())).getOrThrow()
            mobile.eventRepository.createRegistrationTeam(eventId, null, assertNotNull(preparation.draft).revision, team).getOrThrow()
            val players = mobile.eventRepository.observeRegistrationDraft(eventId).first()
            assertEquals("players", players?.draft?.step)
            assertEquals(team.id, players?.selectedTeamId)
            assertEquals(team.id, mobile.database.getTeamDao.getTeam(team.id).id)

            site("site-save", eventId, team.id)
            val resumed = mobile.eventRepository.loadRegistrationDraft(eventId).getOrThrow()
            assertEquals("signing", resumed.draft?.step)
            assertEquals("Bus from site", resumed.draft?.answers?.get("travel"))
            assertEquals(resumed, mobile.eventRepository.observeRegistrationDraft(eventId).first())
            val stale = secondDevice.eventRepository.loadRegistrationDraft(eventId).getOrThrow()
            val draft = assertNotNull(resumed.draft)
            val updated = mobile.eventRepository.saveRegistrationDraft(eventId, null, draft.revision,
                draft.copy(answers = mapOf("travel" to "Train from mobile"), step = "review")).getOrThrow()
            val siteState = jsonMVP.decodeFromString<EventRegistrationDraftResponseDto>(site("site-read", eventId)).toModel()
            assertEquals(updated, siteState)
            val staleDraft = assertNotNull(stale.draft)
            val conflict = secondDevice.eventRepository.saveRegistrationDraft(eventId, null, staleDraft.revision, staleDraft.copy(answers = mapOf("travel" to "Stale device")))
            assertTrue(conflict.isFailure)
            assertEquals(updated, secondDevice.eventRepository.observeRegistrationDraft(eventId).first())
            assertNull(otherAccount.eventRepository.loadRegistrationDraft(eventId).getOrThrow().draft)
        } finally {
            mobile.eventRepository.clearRegistrationDraft(eventId)
            teamId?.let { mobile.deleteTeam(it) }
            mobile.deleteEvent(eventId)
            otherAccount.close()
            secondDevice.close()
            mobile.close()
        }
    }
}
