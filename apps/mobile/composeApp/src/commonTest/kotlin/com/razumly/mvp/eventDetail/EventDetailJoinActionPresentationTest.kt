package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailJoinActionPresentationTest {
    @Test
    fun withdrawalPresentation_startedPaidParticipantRequestsRefund() {
        val target = WithdrawTargetOption(
            userId = "user-1",
            fullName = "User One",
            membership = WithdrawTargetMembership.PARTICIPANT,
            isSelf = true,
        )

        val presentation = buildEventDetailWithdrawalPresentation(
            event = Event(teamSignup = false),
            withdrawTargets = listOf(target),
            refundPolicy = EventRefundPolicy(
                eventHasStarted = true,
                refundDeadline = null,
                canAutoRefund = false,
            ),
            hasAnyPaidDivision = true,
            isUserInEvent = true,
            isCaptain = false,
            isFreeAgent = false,
            isWaitListed = false,
        )

        assertTrue(presentation.platformRefundsAvailable)
        assertTrue(presentation.canRequestRefundAfterStart)
        assertFalse(presentation.canLeaveEvent)
        assertEquals(listOf(target), presentation.actionWithdrawTargets)
        assertEquals("Request Refund", presentation.leaveOrRefundActionLabel)
    }

    @Test
    fun joinPresentation_paidTeamFailureOffersPaymentRetryAndSelectsDivision() {
        var joined = false
        var selectedDivisionId: String? = null
        val event = Event(
            teamSignup = true,
            singleDivision = true,
            priceCents = 2_500,
            divisions = listOf("open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    name = "Open",
                    price = 2_500,
                ),
            ),
        )

        val presentation = buildEventDetailJoinPresentation(
            event = event,
            selectedDivision = "open",
            selectedJoinOptionDivisionId = "open",
            hasAnyPaidDivision = true,
            tournamentPoolPlayEnabled = false,
            isUserInEvent = false,
            selectedWeeklyOccurrenceJoined = false,
            isEventFull = false,
            joinBlockedByStart = false,
            isWeeklyParentEvent = false,
            hasSelectedWeeklyOccurrence = false,
            isAffiliateEvent = false,
            isRegistrationPaymentFailed = true,
            onJoinEvent = { joined = true },
            onSelectTeam = { selectedDivisionId = it },
        )

        assertEquals(2_500, presentation.priceCents)
        assertEquals(listOf("Join as Free Agent", "Complete payment"), presentation.options.map { it.label })
        presentation.options.first().onClick()
        assertTrue(joined)
        presentation.options.last().onClick()
        assertEquals("open", selectedDivisionId)
    }

    @Test
    fun joinPresentation_weeklyParentRequiresOccurrenceSelection() {
        val presentation = buildEventDetailJoinPresentation(
            event = Event(teamSignup = false),
            selectedDivision = null,
            selectedJoinOptionDivisionId = null,
            hasAnyPaidDivision = false,
            tournamentPoolPlayEnabled = false,
            isUserInEvent = false,
            selectedWeeklyOccurrenceJoined = false,
            isEventFull = false,
            joinBlockedByStart = false,
            isWeeklyParentEvent = true,
            hasSelectedWeeklyOccurrence = false,
            isAffiliateEvent = false,
            isRegistrationPaymentFailed = false,
            onJoinEvent = {},
            onSelectTeam = {},
        )

        assertTrue(presentation.options.isEmpty())
    }
}
