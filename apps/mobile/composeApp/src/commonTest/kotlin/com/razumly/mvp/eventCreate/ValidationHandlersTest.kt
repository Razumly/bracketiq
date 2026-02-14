package com.razumly.mvp.eventCreate

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ValidationHandlersTest : MainDispatcherTest() {
    @Test
    fun given_price_input_when_invalid_then_error_callback_is_true_and_state_is_unchanged() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        val originalPrice = harness.component.newEventState.value.priceCents
        var priceError: Boolean? = null

        harness.component.validateAndUpdatePrice("-1") { priceError = it }
        advance()

        assertTrue(priceError == true)
        assertEquals(originalPrice, harness.component.newEventState.value.priceCents)
    }

    @Test
    fun given_price_input_when_valid_then_event_price_updates_in_cents() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        var priceError: Boolean? = null
        harness.component.validateAndUpdatePrice("12.34") { priceError = it }
        advance()

        assertFalse(priceError ?: true)
        assertEquals(1234, harness.component.newEventState.value.priceCents)
    }

    @Test
    fun given_team_size_input_when_outside_supported_range_then_update_is_rejected() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField { copy(teamSizeLimit = 4) }
        advance()

        var teamSizeError: Boolean? = null
        harness.component.validateAndUpdateTeamSize("1") { teamSizeError = it }
        advance()

        assertTrue(teamSizeError == true)
        assertEquals(4, harness.component.newEventState.value.teamSizeLimit)
    }

    @Test
    fun given_team_size_input_when_within_supported_range_then_team_size_is_updated() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        var teamSizeError: Boolean? = null
        harness.component.validateAndUpdateTeamSize("6") { teamSizeError = it }
        advance()

        assertFalse(teamSizeError ?: true)
        assertEquals(6, harness.component.newEventState.value.teamSizeLimit)
    }

    @Test
    fun given_max_players_input_when_non_positive_then_update_is_rejected() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField { copy(maxParticipants = 10) }
        advance()

        var maxPlayersError: Boolean? = null
        harness.component.validateAndUpdateMaxPlayers("0") { maxPlayersError = it }
        advance()

        assertTrue(maxPlayersError == true)
        assertEquals(10, harness.component.newEventState.value.maxParticipants)
    }

    @Test
    fun given_max_players_input_when_positive_then_max_players_is_updated() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        var maxPlayersError: Boolean? = null
        harness.component.validateAndUpdateMaxPlayers("24") { maxPlayersError = it }
        advance()

        assertFalse(maxPlayersError ?: true)
        assertEquals(24, harness.component.newEventState.value.maxParticipants)
    }
}
