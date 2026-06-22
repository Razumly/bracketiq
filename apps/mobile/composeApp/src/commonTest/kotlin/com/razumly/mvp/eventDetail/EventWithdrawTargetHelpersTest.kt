package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventWithdrawTargetHelpersTest {

    @Test
    fun current_user_registration_membership_resolves_active_roles_and_payment_state() {
        val state = resolveCurrentUserRegistrationMembership(
            registrations = listOf(
                registration(
                    id = "team-pending",
                    registrantType = " TEAM ",
                    registrantId = "team-parent-1",
                    eventTeamId = " event-team-1 ",
                    rosterRole = " participant ",
                    status = " pending ",
                ),
                registration(
                    id = "self-failed",
                    registrantType = "SELF",
                    registrantId = "user-1",
                    rosterRole = "PARTICIPANT",
                    status = "PAYMENT_FAILED",
                ),
                registration(
                    id = "other",
                    registrantType = "SELF",
                    registrantId = "user-2",
                    rosterRole = "WAITLIST",
                    status = "ACTIVE",
                ),
            ),
            selectedOccurrence = null,
            currentUserId = " user-1 ",
            currentUserTeamIds = setOf("event-team-1"),
            isWeeklyParentEvent = false,
        )

        assertEquals(
            CurrentUserRegistrationMembershipState(
                participant = true,
                paymentPending = true,
                paymentFailed = true,
                teamId = "event-team-1",
            ),
            state,
        )
    }

    @Test
    fun current_user_registration_membership_filters_weekly_occurrence() {
        val registrations = listOf(
            registration(
                registrantType = "SELF",
                registrantId = "user-1",
                rosterRole = "PARTICIPANT",
                status = "ACTIVE",
                slotId = "slot-1",
                occurrenceDate = "2026-07-01",
            ),
        )

        assertEquals(
            CurrentUserRegistrationMembershipState(),
            resolveCurrentUserRegistrationMembership(
                registrations = registrations,
                selectedOccurrence = EventOccurrenceSelection(
                    slotId = "slot-2",
                    occurrenceDate = "2026-07-01",
                ),
                currentUserId = "user-1",
                currentUserTeamIds = emptySet(),
                isWeeklyParentEvent = true,
            ),
        )
        assertEquals(
            CurrentUserRegistrationMembershipState(participant = true),
            resolveCurrentUserRegistrationMembership(
                registrations = registrations,
                selectedOccurrence = EventOccurrenceSelection(
                    slotId = "slot-1",
                    occurrenceDate = "2026-07-01",
                ),
                currentUserId = "user-1",
                currentUserTeamIds = emptySet(),
                isWeeklyParentEvent = true,
            ),
        )
    }

    @Test
    fun current_user_cached_empty_membership_suppresses_event_snapshot_fallback() {
        val cachedMembership = resolveCurrentUserRegistrationMembership(
            registrations = listOf(
                registration(
                    registrantType = "SELF",
                    registrantId = "other-user",
                    rosterRole = "PARTICIPANT",
                    status = "ACTIVE",
                ),
            ),
            selectedOccurrence = null,
            currentUserId = "user-1",
            currentUserTeamIds = emptySet(),
            isWeeklyParentEvent = false,
        )

        assertEquals(CurrentUserRegistrationMembershipState(), cachedMembership)
        assertNull(
            resolveWithdrawTargetMembershipFromEvent(
                event = Event(userIds = listOf("user-1")),
                targetUserId = "user-1",
                currentUserId = "user-1",
                currentUserTeamIds = emptySet(),
                currentUserMembership = cachedMembership,
                weeklyParentWithoutSelection = false,
            ),
        )
    }

    @Test
    fun withdraw_target_membership_resolves_snapshot_and_current_user_team_membership() {
        val event = Event(
            teamSignup = true,
            userIds = listOf("child-1"),
            waitListIds = listOf("waitlisted-user"),
            freeAgentIds = listOf("free-agent-user"),
            teamIds = listOf(" team-1 "),
        )

        assertEquals(
            WithdrawTargetMembership.PARTICIPANT,
            resolveWithdrawTargetMembershipFromEvent(
                event = event,
                targetUserId = "child-1",
                currentUserId = "user-1",
                currentUserTeamIds = setOf("team-1"),
                currentUserMembership = null,
                weeklyParentWithoutSelection = false,
            ),
        )
        assertEquals(
            WithdrawTargetMembership.WAITLIST,
            resolveWithdrawTargetMembershipFromEvent(
                event = event,
                targetUserId = "waitlisted-user",
                currentUserId = "user-1",
                currentUserTeamIds = setOf("team-1"),
                currentUserMembership = null,
                weeklyParentWithoutSelection = false,
            ),
        )
        assertEquals(
            WithdrawTargetMembership.FREE_AGENT,
            resolveWithdrawTargetMembershipFromEvent(
                event = event,
                targetUserId = "free-agent-user",
                currentUserId = "user-1",
                currentUserTeamIds = setOf("team-1"),
                currentUserMembership = null,
                weeklyParentWithoutSelection = false,
            ),
        )
        assertEquals(
            WithdrawTargetMembership.PARTICIPANT,
            resolveWithdrawTargetMembershipFromEvent(
                event = event,
                targetUserId = "user-1",
                currentUserId = "user-1",
                currentUserTeamIds = setOf("team-1"),
                currentUserMembership = null,
                weeklyParentWithoutSelection = false,
            ),
        )
    }

    @Test
    fun withdraw_target_membership_uses_cached_current_user_membership_before_snapshot() {
        val event = Event(
            userIds = listOf("user-1"),
            waitListIds = listOf("user-1"),
        )

        assertEquals(
            WithdrawTargetMembership.WAITLIST,
            resolveWithdrawTargetMembershipFromEvent(
                event = event,
                targetUserId = "user-1",
                currentUserId = "user-1",
                currentUserTeamIds = emptySet(),
                currentUserMembership = CurrentUserRegistrationMembershipState(waitlist = true),
                weeklyParentWithoutSelection = false,
            ),
        )
        assertNull(
            resolveWithdrawTargetMembershipFromEvent(
                event = event,
                targetUserId = "user-1",
                currentUserId = "user-1",
                currentUserTeamIds = emptySet(),
                currentUserMembership = CurrentUserRegistrationMembershipState(),
                weeklyParentWithoutSelection = true,
            ),
        )
    }

    @Test
    fun refund_and_team_withdrawal_decisions_require_paid_participant_current_team_registration() {
        val paidEvent = Event(priceCents = 1500, teamSignup = true)
        val freeEvent = paidEvent.copy(priceCents = 0)

        assertTrue(canRequestPaidRefund(paidEvent, WithdrawTargetMembership.PARTICIPANT))
        assertFalse(canRequestPaidRefund(paidEvent, WithdrawTargetMembership.WAITLIST))
        assertFalse(canRequestPaidRefund(freeEvent, WithdrawTargetMembership.PARTICIPANT))

        assertTrue(
            usesRegisteredTeamWithdrawal(
                event = paidEvent,
                targetUserId = "user-1",
                currentUserId = "user-1",
                membership = WithdrawTargetMembership.PARTICIPANT,
                currentUserIsFreeAgent = false,
            ),
        )
        assertFalse(
            usesRegisteredTeamWithdrawal(
                event = paidEvent,
                targetUserId = "child-1",
                currentUserId = "user-1",
                membership = WithdrawTargetMembership.PARTICIPANT,
                currentUserIsFreeAgent = false,
            ),
        )
        assertFalse(
            usesRegisteredTeamWithdrawal(
                event = paidEvent,
                targetUserId = "user-1",
                currentUserId = "user-1",
                membership = WithdrawTargetMembership.PARTICIPANT,
                currentUserIsFreeAgent = true,
            ),
        )
    }

    @Test
    fun join_and_payment_plan_error_predicates_match_expected_server_messages() {
        assertTrue(IllegalStateException("User is already registered").isAlreadyRegisteredJoinError())
        assertTrue(IllegalStateException("Registrant is already in event").isAlreadyRegisteredJoinError())
        assertTrue(IllegalStateException("Already a participant").isAlreadyRegisteredJoinError())
        assertFalse(IllegalStateException("Registration closed").isAlreadyRegisteredJoinError())

        assertTrue(
            IllegalStateException("Payment plan already exists for this owner")
                .isDuplicatePaymentPlanError(),
        )
        assertFalse(IllegalStateException("Payment required").isDuplicatePaymentPlanError())
    }

    private fun registration(
        id: String = "registration-1",
        registrantType: String,
        registrantId: String,
        rosterRole: String?,
        status: String?,
        eventTeamId: String? = null,
        slotId: String? = null,
        occurrenceDate: String? = null,
    ): EventRegistrationCacheEntry {
        return EventRegistrationCacheEntry(
            id = id,
            eventId = "event-1",
            registrantId = registrantId,
            registrantType = registrantType,
            rosterRole = rosterRole,
            status = status,
            eventTeamId = eventTeamId,
            slotId = slotId,
            occurrenceDate = occurrenceDate,
        )
    }
}
