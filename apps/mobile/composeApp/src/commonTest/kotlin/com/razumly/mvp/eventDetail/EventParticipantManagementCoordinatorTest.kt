package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.EventComplianceUserSummary
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.EventParticipantDivisionWarning
import com.razumly.mvp.core.data.repositories.EventParticipantManagementEntry
import com.razumly.mvp.core.data.repositories.EventParticipantManagementSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamBillCreateRequest
import com.razumly.mvp.core.data.repositories.EventTeamBillingSnapshot
import com.razumly.mvp.core.data.repositories.EventTeamComplianceSummary
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckout
import com.razumly.mvp.core.data.repositories.EventTeamPaymentCheckoutRequest
import kotlinx.coroutines.test.runTest
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

    @Test
    fun refresh_participant_management_snapshot_trims_event_id_and_clears_loading() = runTest {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )
        val occurrence = EventOccurrenceSelection(
            slotId = "slot-1",
            occurrenceDate = "2026-07-01",
        )
        var loadedEventId: String? = null
        var loadedOccurrence: EventOccurrenceSelection? = null

        val error = coordinator.refreshParticipantManagementSnapshot(
            eventId = " event-1 ",
            occurrence = occurrence,
            reportErrors = true,
        ) { eventId, requestedOccurrence ->
            assertTrue(coordinator.participantManagementLoading.value)
            loadedEventId = eventId
            loadedOccurrence = requestedOccurrence
            Result.success(EventParticipantManagementSnapshot())
        }

        assertNull(error)
        assertEquals("event-1", loadedEventId)
        assertEquals(occurrence, loadedOccurrence)
        assertFalse(coordinator.participantManagementLoading.value)
    }

    @Test
    fun refresh_participant_management_snapshot_reports_requested_failures_only() = runTest {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )

        val reported = coordinator.refreshParticipantManagementSnapshot(
            eventId = "event-1",
            occurrence = null,
            reportErrors = true,
        ) { _, _ ->
            Result.failure(IllegalStateException("Snapshot unavailable"))
        }

        assertEquals("Snapshot unavailable", reported?.message)
        assertFalse(coordinator.participantManagementLoading.value)

        val hidden = coordinator.refreshParticipantManagementSnapshot(
            eventId = "event-1",
            occurrence = null,
            reportErrors = false,
        ) { _, _ ->
            Result.failure(IllegalStateException("Snapshot unavailable"))
        }

        assertNull(hidden)
        assertFalse(coordinator.participantManagementLoading.value)
    }

    @Test
    fun refresh_participant_compliance_uses_team_or_user_loader_and_clears_loading() = runTest {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )
        val occurrence = EventOccurrenceSelection(
            slotId = "slot-1",
            occurrenceDate = "2026-07-01",
        )
        var teamCalls = 0
        var userCalls = 0

        val teamError = coordinator.refreshParticipantComplianceSummaries(
            eventId = " event-1 ",
            occurrence = occurrence,
            teamSignup = true,
            reportErrors = true,
            loadTeamCompliance = { eventId, requestedOccurrence ->
                assertTrue(coordinator.participantComplianceLoading.value)
                assertEquals("event-1", eventId)
                assertEquals(occurrence, requestedOccurrence)
                teamCalls += 1
                Result.success(emptyList())
            },
            loadUserCompliance = { _, _ ->
                userCalls += 1
                Result.failure(IllegalStateException("User loader should not run"))
            },
        )

        assertNull(teamError)
        assertEquals(1, teamCalls)
        assertEquals(0, userCalls)
        assertFalse(coordinator.participantComplianceLoading.value)

        val userError = coordinator.refreshParticipantComplianceSummaries(
            eventId = "event-1",
            occurrence = null,
            teamSignup = false,
            reportErrors = true,
            loadTeamCompliance = { _, _ ->
                teamCalls += 1
                Result.failure(IllegalStateException("Team loader should not run"))
            },
            loadUserCompliance = { _, _ ->
                userCalls += 1
                Result.failure(IllegalStateException("Compliance unavailable"))
            },
        )

        assertEquals("Compliance unavailable", userError?.message)
        assertEquals(1, teamCalls)
        assertEquals(1, userCalls)
        assertFalse(coordinator.participantComplianceLoading.value)
    }

    @Test
    fun refresh_participant_management_data_runs_snapshot_and_compliance_and_prefers_compliance_error() = runTest {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )
        val target = ParticipantManagementRoomTarget(
            eventId = "event-1",
            slotId = "slot-1",
            occurrenceDate = "2026-07-01",
            teamSignup = false,
        )
        var snapshotCalls = 0
        var userComplianceCalls = 0

        val error = coordinator.refreshParticipantManagementData(
            target = target,
            reportErrors = true,
            loadSnapshot = { eventId, occurrence ->
                snapshotCalls += 1
                assertEquals("event-1", eventId)
                assertEquals(target.toOccurrence(), occurrence)
                Result.failure(IllegalStateException("Snapshot unavailable"))
            },
            loadTeamCompliance = { _, _ ->
                Result.failure(IllegalStateException("Team loader should not run"))
            },
            loadUserCompliance = { eventId, occurrence ->
                userComplianceCalls += 1
                assertEquals("event-1", eventId)
                assertEquals(target.toOccurrence(), occurrence)
                Result.failure(IllegalStateException("Compliance unavailable"))
            },
        )

        assertEquals("Compliance unavailable", error?.message)
        assertEquals(1, snapshotCalls)
        assertEquals(1, userComplianceCalls)
        assertFalse(coordinator.participantManagementLoading.value)
        assertFalse(coordinator.participantComplianceLoading.value)
    }

    @Test
    fun participant_billing_snapshot_and_checkout_trim_ids_and_reject_blank_targets() = runTest {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )
        val snapshot = EventTeamBillingSnapshot(teamId = "team-1")
        val checkout = EventTeamPaymentCheckout(
            checkoutUrl = "https://checkout.example",
            qrCodeUrl = "https://qr.example",
            amountCents = 1000,
            eventAmountCents = 900,
            billOwnerType = "TEAM",
            billOwnerId = "team-1",
        )
        val checkoutRequest = EventTeamPaymentCheckoutRequest(
            ownerType = "TEAM",
            eventAmountCents = 900,
        )
        val calls = mutableListOf<String>()

        val loadedSnapshot = coordinator.getParticipantBillingSnapshot(
            eventId = " event-1 ",
            teamId = " team-1 ",
        ) { eventId, teamId ->
            calls += "snapshot:$eventId:$teamId"
            Result.success(snapshot)
        }
        val loadedCheckout = coordinator.createParticipantPaymentCheckout(
            eventId = " event-1 ",
            teamId = " team-1 ",
            request = checkoutRequest,
        ) { eventId, teamId, request ->
            calls += "checkout:$eventId:$teamId:${request.eventAmountCents}"
            Result.success(checkout)
        }
        val rejected = coordinator.getParticipantBillingSnapshot(
            eventId = " ",
            teamId = "team-1",
        ) { _, _ ->
            calls += "should-not-load"
            Result.success(snapshot)
        }

        assertEquals(snapshot, loadedSnapshot.getOrThrow())
        assertEquals(checkout, loadedCheckout.getOrThrow())
        assertTrue(rejected.isFailure)
        assertEquals(
            listOf(
                "snapshot:event-1:team-1",
                "checkout:event-1:team-1:900",
            ),
            calls,
        )
    }

    @Test
    fun participant_bill_and_refund_refresh_after_success_only() = runTest {
        val coordinator = EventParticipantManagementCoordinator(
            eventTeamsAndParticipantsLoadingInitially = false,
        )
        val billRequest = EventTeamBillCreateRequest(
            ownerType = "TEAM",
            eventAmountCents = 1200,
        )
        val events = mutableListOf<String>()

        val created = coordinator.createParticipantBill(
            eventId = " event-1 ",
            teamId = " team-1 ",
            request = billRequest,
            createBill = { eventId, teamId, request ->
                events += "bill:$eventId:$teamId:${request.eventAmountCents}"
                Result.success("bill-1")
            },
            refreshAfterSuccess = {
                events += "refresh-after-bill"
            },
        )
        val failedBill = coordinator.createParticipantBill(
            eventId = "event-1",
            teamId = "team-1",
            request = billRequest,
            createBill = { _, _, _ ->
                events += "bill-failed"
                Result.failure(IllegalStateException("bill failed"))
            },
            refreshAfterSuccess = {
                events += "should-not-refresh-bill"
            },
        )
        val refunded = coordinator.refundParticipantPayment(
            eventId = " event-1 ",
            teamId = " team-1 ",
            billPaymentId = " payment-1 ",
            amountCents = 500,
            refundPayment = { eventId, teamId, billPaymentId, amountCents ->
                events += "refund:$eventId:$teamId:$billPaymentId:$amountCents"
                Result.success(Unit)
            },
            refreshAfterSuccess = {
                events += "refresh-after-refund"
            },
        )

        assertTrue(created.isSuccess)
        assertTrue(failedBill.isFailure)
        assertTrue(refunded.isSuccess)
        assertEquals(
            listOf(
                "bill:event-1:team-1:1200",
                "refresh-after-bill",
                "bill-failed",
                "refund:event-1:team-1: payment-1 :500",
                "refresh-after-refund",
            ),
            events,
        )
    }
}
