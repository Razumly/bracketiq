package com.razumly.mvp.teamManagement

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class TeamRegistrationFormStateTest {
    @Test
    fun syncedRegistrationInputs_uses_latest_team_values_when_form_not_edited() {
        val synced = syncedRegistrationInputs(
            registrationSettingsEdited = false,
            joinPolicyInput = TEAM_JOIN_POLICY_OPEN_REGISTRATION,
            registrationCostInput = "2500",
            sourceJoinPolicy = TEAM_JOIN_POLICY_CLOSED,
            sourceOpenRegistration = false,
            sourceRegistrationPriceCents = 0,
        )

        assertEquals(TEAM_JOIN_POLICY_CLOSED to "", synced)
    }

    @Test
    fun syncedRegistrationInputs_preserves_local_registration_edits() {
        val synced = syncedRegistrationInputs(
            registrationSettingsEdited = true,
            joinPolicyInput = TEAM_JOIN_POLICY_OPEN_REGISTRATION,
            registrationCostInput = "2500",
            sourceJoinPolicy = TEAM_JOIN_POLICY_CLOSED,
            sourceOpenRegistration = false,
            sourceRegistrationPriceCents = 0,
        )

        assertEquals(TEAM_JOIN_POLICY_OPEN_REGISTRATION to "2500", synced)
    }

    @Test
    fun resolvedRegistrationPriceCents_zeroes_paid_registration_when_charging_is_disabled() {
        assertEquals(
            0,
            resolvedRegistrationPriceCents(
                joinPolicy = TEAM_JOIN_POLICY_OPEN_REGISTRATION,
                canChargeRegistration = false,
                registrationPriceCentsInput = 2500,
            ),
        )
        assertEquals(
            0,
            resolvedRegistrationPriceCents(
                joinPolicy = TEAM_JOIN_POLICY_CLOSED,
                canChargeRegistration = true,
                registrationPriceCentsInput = 2500,
            ),
        )
        assertEquals(
            2500,
            resolvedRegistrationPriceCents(
                joinPolicy = TEAM_JOIN_POLICY_OPEN_REGISTRATION,
                canChargeRegistration = true,
                registrationPriceCentsInput = 2500,
            ),
        )
    }

    @Test
    fun resolvedRegistrationPriceCents_keeps_request_only_price_as_label_without_charging() {
        assertEquals(
            2500,
            resolvedRegistrationPriceCents(
                joinPolicy = TEAM_JOIN_POLICY_REQUEST_TO_JOIN,
                canChargeRegistration = false,
                registrationPriceCentsInput = 2500,
            ),
        )
    }

    @Test
    fun shouldShowTeamDivisionFields_only_when_joinable_team_has_sport() {
        assertEquals(false, shouldShowTeamDivisionFields(TEAM_JOIN_POLICY_CLOSED, "Volleyball"))
        assertEquals(false, shouldShowTeamDivisionFields(TEAM_JOIN_POLICY_OPEN_REGISTRATION, ""))
        assertEquals(true, shouldShowTeamDivisionFields(TEAM_JOIN_POLICY_OPEN_REGISTRATION, "Volleyball"))
        assertEquals(true, shouldShowTeamDivisionFields(TEAM_JOIN_POLICY_REQUEST_TO_JOIN, "Soccer"))
    }

    @Test
    fun paid_team_price_requires_a_confirmed_quote_before_submit() {
        assertFalse(
            isTeamRegistrationPriceReady(
                joinPolicy = TEAM_JOIN_POLICY_OPEN_REGISTRATION,
                isQuoteConfirmed = false,
            ),
        )
        assertTrue(
            isTeamRegistrationPriceReady(
                joinPolicy = TEAM_JOIN_POLICY_OPEN_REGISTRATION,
                isQuoteConfirmed = true,
            ),
        )
        assertTrue(
            isTeamRegistrationPriceReady(
                joinPolicy = TEAM_JOIN_POLICY_CLOSED,
                isQuoteConfirmed = false,
            ),
        )
    }

    @Test
    fun confirmed_server_total_is_the_exact_team_registration_price() {
        val sentinelServerTotalCents = 9_876

        assertEquals(
            sentinelServerTotalCents,
            resolvedRegistrationPriceCents(
                joinPolicy = TEAM_JOIN_POLICY_OPEN_REGISTRATION,
                canChargeRegistration = true,
                registrationPriceCentsInput = sentinelServerTotalCents,
            ),
        )
    }
}
