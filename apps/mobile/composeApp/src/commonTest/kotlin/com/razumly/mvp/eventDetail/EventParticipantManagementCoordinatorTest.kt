package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.EventParticipantManagementEntry
import com.razumly.mvp.core.data.repositories.EventParticipantManagementSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventParticipantManagementCoordinatorTest {

    @Test
    fun local_state_and_division_warnings_are_applied_and_cleared() {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = true,
        )
        val snapshot = EventParticipantManagementSnapshot(
            userRegistrations = listOf(
                EventParticipantManagementEntry(
                    registrationId = "registration-1",
                    registrantId = "user-1",
                    registrantType = "USER",
                )
            ),
        )
        val teamSummary = EventTeamComplianceSummary(
            teamId = "team-1",
            teamName = "Team One",
        )
        val userSummary = EventComplianceUserSummary(
            userId = "user-1",
            fullName = "User One",
        )
        val warning = EventParticipantDivisionWarning(
            divisionId = "division-1",
            code = "NO_FIELD",
            message = "No field assigned.",
        )

        assertTrue(coordinator.eventTeamsAndParticipantsLoading.value)

        coordinator.setEventTeamsAndParticipantsLoading(false)
        coordinator.applyLocalState(
            ParticipantManagementLocalState(
                snapshot = snapshot,
                teamSummaries = mapOf(teamSummary.teamId to teamSummary),
                userSummaries = mapOf(userSummary.userId to userSummary),
            )
        )
        coordinator.replaceParticipantDivisionWarnings(listOf(warning))

        assertFalse(coordinator.eventTeamsAndParticipantsLoading.value)
        assertEquals(snapshot, coordinator.participantManagementSnapshot.value)
        assertEquals(mapOf("team-1" to teamSummary), coordinator.teamComplianceSummaries.value)
        assertEquals(mapOf("user-1" to userSummary), coordinator.userComplianceSummaries.value)
        assertEquals(listOf(warning), coordinator.participantDivisionWarnings.value)

        coordinator.clearParticipantManagementState()

        assertEquals(EventParticipantManagementSnapshot(), coordinator.participantManagementSnapshot.value)
        assertEquals(emptyMap(), coordinator.teamComplianceSummaries.value)
        assertEquals(emptyMap(), coordinator.userComplianceSummaries.value)
        assertFalse(coordinator.participantManagementLoading.value)
        assertFalse(coordinator.participantComplianceLoading.value)
        assertEquals(listOf(warning), coordinator.participantDivisionWarnings.value)
    }

    @Test
    fun managed_detail_bootstrap_suppresses_already_requested_target_until_cleared() {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )
        val target = ParticipantManagementRoomTarget(
            eventId = "event-1",
            slotId = "slot-1",
            occurrenceDate = "2026-07-01",
            teamSignup = true,
        )

        coordinator.markManagedBootstrapRequested(target = target, manage = true)

        assertFalse(coordinator.beginManagedDetailBootstrap(target))
        assertFalse(coordinator.participantManagementLoading.value)
        assertFalse(coordinator.participantComplianceLoading.value)

        coordinator.clearManagedBootstrapRequestIfCurrent(target)

        assertTrue(coordinator.beginManagedDetailBootstrap(target))
        assertTrue(coordinator.participantManagementLoading.value)
        assertTrue(coordinator.participantComplianceLoading.value)

        coordinator.finishManagedDetailBootstrap()

        assertFalse(coordinator.participantManagementLoading.value)
        assertFalse(coordinator.participantComplianceLoading.value)
        assertEquals("slot-1", target.toOccurrence()?.slotId)
        assertEquals("2026-07-01", target.toOccurrence()?.occurrenceDate)
    }

    @Test
    fun participant_management_request_tokens_keep_latest_request_loading_until_finished() {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )

        assertNull(coordinator.beginParticipantManagementRequest(" "))
        assertFalse(coordinator.participantManagementLoading.value)

        val first = coordinator.beginParticipantManagementRequest("event-1") ?: error("Expected token")
        val second = coordinator.beginParticipantManagementRequest("event-1") ?: error("Expected token")

        assertFalse(coordinator.isCurrentParticipantManagementRequest(first))
        assertTrue(coordinator.isCurrentParticipantManagementRequest(second))
        assertTrue(coordinator.participantManagementLoading.value)

        coordinator.finishParticipantManagementRequest(first)

        assertTrue(coordinator.participantManagementLoading.value)

        coordinator.finishParticipantManagementRequest(second)

        assertFalse(coordinator.participantManagementLoading.value)
    }

    @Test
    fun participant_compliance_request_tokens_keep_latest_request_loading_until_finished() {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )

        assertNull(coordinator.beginParticipantComplianceRequest(" "))
        assertFalse(coordinator.participantComplianceLoading.value)

        val first = coordinator.beginParticipantComplianceRequest("event-1") ?: error("Expected token")
        val second = coordinator.beginParticipantComplianceRequest("event-1") ?: error("Expected token")

        assertFalse(coordinator.isCurrentParticipantComplianceRequest(first))
        assertTrue(coordinator.isCurrentParticipantComplianceRequest(second))
        assertTrue(coordinator.participantComplianceLoading.value)

        coordinator.finishParticipantComplianceRequest(first)

        assertTrue(coordinator.participantComplianceLoading.value)

        coordinator.finishParticipantComplianceRequest(second)

        assertFalse(coordinator.participantComplianceLoading.value)
    }
}
