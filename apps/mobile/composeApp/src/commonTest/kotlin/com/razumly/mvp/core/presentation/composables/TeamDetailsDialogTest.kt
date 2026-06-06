package com.razumly.mvp.core.presentation.composables

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TeamDetailsDialogTest {
    @Test
    fun teamRegistrationButtonLabel_givenFreeTeam_whenReady_thenShowsJoinTeam() {
        assertEquals(
            "Join Team",
            teamRegistrationButtonLabel(
                isRegistering = false,
                isCurrentUserPending = false,
                teamHasCapacity = true,
                registrationPriceCents = 0,
            ),
        )
    }

    @Test
    fun teamRegistrationButtonLabel_givenPaidTeam_whenReady_thenShowsPrice() {
        assertEquals(
            "Join for $35.00",
            teamRegistrationButtonLabel(
                isRegistering = false,
                isCurrentUserPending = false,
                teamHasCapacity = true,
                registrationPriceCents = 3500,
            ),
        )
    }

    @Test
    fun teamRegistrationButtonLabel_givenRequestOnlyTeam_whenReady_thenShowsRequestToJoin() {
        assertEquals(
            "Request to join",
            teamRegistrationButtonLabel(
                isRegistering = false,
                isCurrentUserPending = false,
                teamHasCapacity = true,
                registrationPriceCents = 2500,
                joinPolicy = "REQUEST_TO_JOIN",
            ),
        )
    }

    @Test
    fun shouldShowTeamRegistrationButton_givenActiveUser_thenHidesButton() {
        assertFalse(
            shouldShowTeamRegistrationButton(
                openRegistration = true,
                isCurrentUserActive = true,
                isCurrentUserPending = false,
            ),
        )
    }

    @Test
    fun canRegisterForTeam_givenPendingRegistration_whenTeamCloses_thenStillAllowsResume() {
        assertTrue(
            canRegisterForTeam(
                openRegistration = false,
                isCurrentUserActive = false,
                isCurrentUserPending = true,
                teamHasCapacity = false,
                hasRegisterAction = true,
            ),
        )
    }

    @Test
    fun canRegisterForTeam_givenRequestOnlyTeam_thenAllowsAction() {
        assertTrue(
            canRegisterForTeam(
                openRegistration = false,
                joinPolicy = "REQUEST_TO_JOIN",
                isCurrentUserActive = false,
                isCurrentUserPending = false,
                teamHasCapacity = true,
                hasRegisterAction = true,
            ),
        )
    }
}
