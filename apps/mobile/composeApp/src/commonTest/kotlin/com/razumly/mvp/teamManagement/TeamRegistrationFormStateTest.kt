package com.razumly.mvp.teamManagement

import kotlin.test.Test
import kotlin.test.assertEquals

class TeamRegistrationFormStateTest {
    @Test
    fun syncedRegistrationInputs_uses_latest_team_values_when_form_not_edited() {
        val synced = syncedRegistrationInputs(
            registrationSettingsEdited = false,
            openRegistrationInput = true,
            registrationCostInput = "2500",
            sourceOpenRegistration = false,
            sourceRegistrationPriceCents = 0,
        )

        assertEquals(false to "", synced)
    }

    @Test
    fun syncedRegistrationInputs_preserves_local_registration_edits() {
        val synced = syncedRegistrationInputs(
            registrationSettingsEdited = true,
            openRegistrationInput = true,
            registrationCostInput = "2500",
            sourceOpenRegistration = false,
            sourceRegistrationPriceCents = 0,
        )

        assertEquals(true to "2500", synced)
    }

    @Test
    fun resolvedRegistrationPriceCents_zeroes_paid_registration_when_charging_is_disabled() {
        assertEquals(
            0,
            resolvedRegistrationPriceCents(
                openRegistration = true,
                canChargeRegistration = false,
                registrationPriceCentsInput = 2500,
            ),
        )
        assertEquals(
            0,
            resolvedRegistrationPriceCents(
                openRegistration = false,
                canChargeRegistration = true,
                registrationPriceCentsInput = 2500,
            ),
        )
        assertEquals(
            2500,
            resolvedRegistrationPriceCents(
                openRegistration = true,
                canChargeRegistration = true,
                registrationPriceCentsInput = 2500,
            ),
        )
    }
}
