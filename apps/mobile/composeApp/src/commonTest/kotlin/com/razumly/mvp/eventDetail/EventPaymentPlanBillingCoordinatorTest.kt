package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Bill
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.CreateBillRequest
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class EventPaymentPlanBillingCoordinatorTest {
    @Test
    fun create_payment_plan_bill_builds_non_weekly_bill_request() = runTest {
        val coordinator = EventPaymentPlanBillingCoordinator()
        var capturedRequest: CreateBillRequest? = null

        val result = coordinator.createPaymentPlanBillForOwner(
            event = paidEvent(),
            ownerType = "USER",
            ownerId = " user-1 ",
            allowSplit = false,
            preferredDivisionId = "open",
            selectedWeeklyOccurrence = null,
            createBill = { request ->
                capturedRequest = request
                Result.success(Bill(ownerType = request.ownerType, ownerId = request.ownerId, totalAmountCents = 4500))
            },
        )

        assertEquals(Result.success(PaymentPlanBillStatus.CREATED), result)
        assertEquals(
            CreateBillRequest(
                ownerType = "USER",
                ownerId = "user-1",
                totalAmountCents = 4500,
                eventId = "event-1",
                organizationId = "org-1",
                installmentAmounts = listOf(1500, 3000),
                installmentDueDates = listOf("2026-07-01", "2026-08-01"),
                installmentDueRelativeDays = emptyList(),
                allowSplit = false,
                paymentPlanEnabled = true,
            ),
            capturedRequest,
        )
    }

    @Test
    fun create_payment_plan_bill_uses_weekly_occurrence_and_relative_due_days() = runTest {
        val coordinator = EventPaymentPlanBillingCoordinator()
        var capturedRequest: CreateBillRequest? = null

        val result = coordinator.createPaymentPlanBillForOwner(
            event = weeklyPaidEvent(),
            ownerType = "TEAM",
            ownerId = "team-1",
            allowSplit = true,
            preferredDivisionId = "open",
            selectedWeeklyOccurrence = EventOccurrenceSelection(
                slotId = "slot-1",
                occurrenceDate = "2026-07-01",
            ),
            createBill = { request ->
                capturedRequest = request
                Result.success(Bill(ownerType = request.ownerType, ownerId = request.ownerId, totalAmountCents = 4500))
            },
        )

        assertEquals(Result.success(PaymentPlanBillStatus.CREATED), result)
        assertEquals("slot-1", capturedRequest?.slotId)
        assertEquals("2026-07-01", capturedRequest?.occurrenceDate)
        assertEquals(emptyList(), capturedRequest?.installmentDueDates)
        assertEquals(listOf(0, 14), capturedRequest?.installmentDueRelativeDays)
        assertEquals(true, capturedRequest?.allowSplit)
    }

    @Test
    fun create_payment_plan_bill_rejects_invalid_inputs_and_duplicate_bill_success() = runTest {
        val coordinator = EventPaymentPlanBillingCoordinator()
        val missingOwner = coordinator.createPaymentPlanBillForOwner(
            event = paidEvent(),
            ownerType = "USER",
            ownerId = " ",
            allowSplit = false,
            preferredDivisionId = "open",
            selectedWeeklyOccurrence = null,
            createBill = { error("Should not create bill") },
        )
        val missingWeeklyOccurrence = coordinator.createPaymentPlanBillForOwner(
            event = weeklyPaidEvent(),
            ownerType = "USER",
            ownerId = "user-1",
            allowSplit = false,
            preferredDivisionId = "open",
            selectedWeeklyOccurrence = null,
            createBill = { error("Should not create bill") },
        )
        val duplicate = coordinator.createPaymentPlanBillForOwner(
            event = paidEvent(),
            ownerType = "USER",
            ownerId = "user-1",
            allowSplit = false,
            preferredDivisionId = "open",
            selectedWeeklyOccurrence = null,
            createBill = { Result.failure(IllegalStateException("Payment plan already exists")) },
        )

        assertFailsWith<IllegalArgumentException> { missingOwner.getOrThrow() }
        assertFailsWith<IllegalArgumentException> { missingWeeklyOccurrence.getOrThrow() }
        assertEquals(Result.success(PaymentPlanBillStatus.ALREADY_EXISTS), duplicate)
    }

    @Test
    fun rollback_helpers_call_repository_callbacks_and_log_failures() = runTest {
        val coordinator = EventPaymentPlanBillingCoordinator()
        val event = paidEvent()
        val occurrence = EventOccurrenceSelection(slotId = "slot-1", occurrenceDate = "2026-07-01")
        val team = TeamWithPlayers(
            team = Team(captainId = "user-1").copy(id = "team-1"),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
        val failure = IllegalStateException("rollback failed")
        val events = mutableListOf<String>()
        val warnings = mutableListOf<Pair<String, Throwable>>()

        coordinator.rollbackUserJoinAfterBillingFailure(
            event = event,
            currentUserId = "user-1",
            occurrence = occurrence,
            removeCurrentUserFromEvent = { targetEvent, targetUserId, targetOccurrence ->
                events += "user:${targetEvent.id}:$targetUserId:${targetOccurrence?.slotId}"
                Result.failure(failure)
            },
            logWarning = { message, throwable -> warnings += message to throwable },
        )
        coordinator.rollbackTeamJoinAfterBillingFailure(
            event = event,
            team = team,
            occurrence = occurrence,
            removeTeamFromEvent = { targetEvent, targetTeam, targetOccurrence ->
                events += "team:${targetEvent.id}:${targetTeam.team.id}:${targetOccurrence?.slotId}"
                Result.failure(failure)
            },
            logWarning = { message, throwable -> warnings += message to throwable },
        )

        assertEquals(
            listOf(
                "user:event-1:user-1:slot-1",
                "team:event-1:team-1:slot-1",
            ),
            events,
        )
        assertEquals(
            listOf(
                "Failed to rollback user join after payment plan billing error.",
                "Failed to rollback team join after payment plan billing error.",
            ),
            warnings.map { it.first },
        )
        assertSame(failure, warnings[0].second)
        assertSame(failure, warnings[1].second)
    }

    private fun paidEvent(): Event {
        return Event(
            id = "event-1",
            organizationId = "org-1",
            divisions = listOf("open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    price = 4500,
                    allowPaymentPlans = true,
                    installmentAmounts = listOf(1500, 3000),
                    installmentDueDates = listOf(" 2026-07-01 ", "", "2026-08-01"),
                ),
            ),
        )
    }

    private fun weeklyPaidEvent(): Event {
        return paidEvent().copy(
            eventType = EventType.WEEKLY_EVENT,
            timeSlotIds = listOf("slot-1"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    price = 4500,
                    allowPaymentPlans = true,
                    installmentAmounts = listOf(1500, 3000),
                    installmentDueDates = listOf("2026-07-01", "2026-08-01"),
                    installmentDueRelativeDays = listOf(0, 14),
                ),
            ),
        )
    }
}
