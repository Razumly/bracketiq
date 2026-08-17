package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class EventWithdrawalActionCoordinatorTest {
    @Test
    fun request_refund_uses_team_refund_and_refreshes_after_success() = runTest {
        val events = mutableListOf<String>()
        val coordinator = EventWithdrawalActionCoordinator(EventRegistrationFlowCoordinator())

        val result = coordinator.runForTest(
            action = EventWithdrawalExecutionAction.REQUEST_REFUND,
            event = paidEvent(teamSignup = true),
            targetUserId = " user-1 ",
            refundReason = "weather",
            events = events,
        )

        assertIs<EventWithdrawalExecutionResult.Success>(result)
        assertEquals(
            listOf(
                "membership:user-1",
                "show:Requesting Refund ...",
                "team",
                "remove-team:event-1:team-1:request:weather:null",
                "show:Reloading Event",
                "refresh:event-1:Failed to refresh event after refund request.",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun leave_waitlist_uses_user_removal_and_refreshes_after_success() = runTest {
        val events = mutableListOf<String>()
        val coordinator = EventWithdrawalActionCoordinator(EventRegistrationFlowCoordinator())

        val result = coordinator.runForTest(
            action = EventWithdrawalExecutionAction.LEAVE,
            targetUserId = " child-1 ",
            membership = WithdrawTargetMembership.WAITLIST,
            events = events,
        )

        assertIs<EventWithdrawalExecutionResult.Success>(result)
        assertEquals(
            listOf(
                "membership:child-1",
                "show:Leaving Event ...",
                "remove-user:event-1:child-1:null",
                "show:Reloading Event",
                "refresh:event-1:Failed to refresh event after leaving.",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun weekly_parent_without_selected_occurrence_rejects_before_loading() = runTest {
        val events = mutableListOf<String>()
        val coordinator = EventWithdrawalActionCoordinator(EventRegistrationFlowCoordinator())

        val result = coordinator.runForTest(
            action = EventWithdrawalExecutionAction.LEAVE,
            isWeeklyParentEvent = true,
            selectedWeeklyOccurrence = null,
            events = events,
        )

        val rejected = assertIs<EventWithdrawalExecutionResult.Rejected>(result)
        assertEquals("Select an occurrence before leaving.", rejected.message)
        assertEquals(emptyList(), events)
    }

    @Test
    fun withdraw_and_refund_hides_loading_when_team_registration_is_missing() = runTest {
        val events = mutableListOf<String>()
        val coordinator = EventWithdrawalActionCoordinator(EventRegistrationFlowCoordinator())

        val result = coordinator.runForTest(
            action = EventWithdrawalExecutionAction.WITHDRAW_AND_REFUND,
            event = paidEvent(teamSignup = true),
            team = null,
            events = events,
        )

        val failed = assertIs<EventWithdrawalExecutionResult.Failed>(result)
        assertTrue(failed.message.contains("Unable to resolve your team registration."))
        assertEquals(
            listOf(
                "membership:user-1",
                "show:Withdrawing and Refunding ...",
                "team",
                "hide",
            ),
            events,
        )
    }

    private suspend fun EventWithdrawalActionCoordinator.runForTest(
        action: EventWithdrawalExecutionAction,
        event: Event = paidEvent(),
        targetUserId: String? = "user-1",
        currentUserId: String = "user-1",
        selectedWeeklyOccurrence: EventOccurrenceSelection? = null,
        isWeeklyParentEvent: Boolean = false,
        currentUserIsFreeAgent: Boolean = false,
        eventOrOccurrenceStarted: Boolean = false,
        refundReason: String = "",
        membership: WithdrawTargetMembership? = WithdrawTargetMembership.PARTICIPANT,
        team: TeamWithPlayers? = testTeam(),
        removeTeamResult: Result<Unit> = Result.success(Unit),
        removeUserResult: Result<Unit> = Result.success(Unit),
        leaveAndRefundResult: Result<Unit> = Result.success(Unit),
        events: MutableList<String>,
    ): EventWithdrawalExecutionResult {
        return runWithdrawalAction(
            action = action,
            event = event,
            targetUserId = targetUserId,
            currentUserId = currentUserId,
            selectedWeeklyOccurrence = selectedWeeklyOccurrence,
            isWeeklyParentEvent = isWeeklyParentEvent,
            currentUserIsFreeAgent = currentUserIsFreeAgent,
            eventOrOccurrenceStarted = eventOrOccurrenceStarted,
            refundReason = refundReason,
            resolveMembership = { userId ->
                events += "membership:$userId"
                membership
            },
            usersTeam = {
                events += "team"
                team
            },
            removeTeamFromEvent = { targetEvent, targetTeam, refundMode, reason, occurrence ->
                events += "remove-team:${targetEvent.id}:${targetTeam.team.id}:${refundMode?.wireValue}:$reason:${occurrence?.slotId}"
                removeTeamResult
            },
            removeCurrentUserFromEvent = { targetEvent, userId, occurrence ->
                events += "remove-user:${targetEvent.id}:$userId:${occurrence?.slotId}"
                removeUserResult
            },
            leaveAndRefundEvent = { targetEvent, reason, userId ->
                events += "billing-refund:${targetEvent.id}:$reason:$userId"
                leaveAndRefundResult
            },
            refreshAfterSuccess = { eventId, warningMessage ->
                events += "refresh:$eventId:$warningMessage"
            },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
        )
    }

    private fun paidEvent(teamSignup: Boolean = false): Event {
        return Event(
            id = "event-1",
            teamSignup = teamSignup,
            divisions = listOf("open"),
            divisionDetails = listOf(
                DivisionDetail(
                    id = "open",
                    price = 1000,
                ),
            ),
        )
    }

    private fun testTeam(): TeamWithPlayers {
        return TeamWithPlayers(
            team = Team(captainId = "user-1").copy(id = "team-1"),
            captain = null,
            players = emptyList(),
            pendingPlayers = emptyList(),
        )
    }
}
