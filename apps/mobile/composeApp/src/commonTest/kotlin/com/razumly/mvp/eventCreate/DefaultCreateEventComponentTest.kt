package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Facility
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.OfficialSchedulingMode
import com.razumly.mvp.core.data.dataTypes.SportOfficialPositionTemplate
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.eventDetail.EventStaffRole
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DefaultCreateEventComponentTest : MainDispatcherTest() {
    @Test
    fun create_screen_terms_loading_mirrors_repository_state() = runTest(testDispatcher) {
        val harness = CreateEventHarness()

        assertFalse(harness.component.termsConsentLoading.value)

        harness.userRepository.isChatTermsConsentLoading = true

        assertTrue(harness.component.termsConsentLoading.value)
    }

    @Test
    fun create_screen_uses_shared_terms_consent_state_without_refetching() = runTest(testDispatcher) {
        val harness = CreateEventHarness().apply {
            userRepository.chatTermsConsent = userRepository.chatTermsConsent.copy(
                accepted = false,
                acceptedAt = null,
            )
        }

        advance()

        assertEquals(0, harness.userRepository.getChatTermsConsentStateCalls)
        assertFalse(harness.component.termsConsentState.value.accepted)
    }

    @Test
    fun accepting_terms_updates_create_screen_consent_state() = runTest(testDispatcher) {
        val harness = CreateEventHarness().apply {
            userRepository.chatTermsConsent = userRepository.chatTermsConsent.copy(
                accepted = false,
                acceptedAt = null,
            )
        }

        harness.component.acceptTermsConsent()
        advance()

        assertEquals(1, harness.userRepository.acceptChatTermsConsentCalls)
        assertTrue(harness.component.termsConsentState.value.accepted)
        assertTrue(harness.component.termsConsentState.value.acceptedAt != null)
    }

    @Test
    fun updating_host_and_assistant_hosts_normalizes_ids_and_prevents_host_duplication() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateAssistantHostIds(
            listOf(" assistant-1 ", "", "assistant-1", "user-1", "assistant-2"),
        )
        advance()

        val withAssistants = harness.component.newEventState.value
        assertEquals("user-1", withAssistants.hostId)
        assertEquals(listOf("assistant-1", "assistant-2"), withAssistants.assistantHostIds)

        harness.component.updateHostId("assistant-1")
        advance()

        val withUpdatedHost = harness.component.newEventState.value
        assertEquals("assistant-1", withUpdatedHost.hostId)
        assertEquals(listOf("assistant-2"), withUpdatedHost.assistantHostIds)
    }

    @Test
    fun updating_official_state_supports_toggle_and_add_remove_operations() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateDoTeamsOfficiate(true)
        harness.component.updateTeamOfficialsMaySwap(true)
        harness.component.addOfficialId(" official-1 ")
        harness.component.addOfficialId("official-1")
        harness.component.addOfficialId("official-2")
        advance()

        harness.component.removeOfficialId("official-1")
        advance()

        val updatedEvent = harness.component.newEventState.value
        assertEquals(true, updatedEvent.doTeamsOfficiate)
        assertEquals(true, updatedEvent.teamOfficialsMaySwap)
        assertEquals(listOf("official-2"), updatedEvent.officialIds)
    }

    @Test
    fun selecting_sport_seeds_event_official_positions_from_sport_templates() = runTest(testDispatcher) {
        val sport = createSport(id = "sport-officials", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "R1", count = 1),
                SportOfficialPositionTemplate(name = "R2", count = 1),
            ),
        )
        val harness = CreateEventHarness(sports = listOf(sport))
        advance()

        harness.component.updateEventField { copy(sportId = sport.id) }
        advance()

        val updatedEvent = harness.component.newEventState.value
        assertEquals(listOf("R1", "R2"), updatedEvent.officialPositions.map { it.name })
        assertEquals(listOf(1, 1), updatedEvent.officialPositions.map { it.count })
    }

    @Test
    fun adding_official_after_sport_selection_assigns_all_event_positions_to_official() = runTest(testDispatcher) {
        val sport = createSport(id = "sport-lines", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Referee", count = 1),
                SportOfficialPositionTemplate(name = "Line Judge", count = 2),
            ),
        )
        val harness = CreateEventHarness(sports = listOf(sport))
        advance()

        harness.component.updateEventField { copy(sportId = sport.id) }
        advance()
        harness.component.addOfficialId("official-9")
        advance()

        val updatedEvent = harness.component.newEventState.value
        assertEquals(listOf("official-9"), updatedEvent.officialIds)
        assertEquals(1, updatedEvent.eventOfficials.size)
        assertEquals(
            updatedEvent.officialPositions.map { it.id },
            updatedEvent.eventOfficials.single().positionIds,
        )
    }

    @Test
    fun removing_last_position_does_not_auto_restore_defaults_until_requested() = runTest(testDispatcher) {
        val sport = createSport(id = "sport-clearable", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Referee", count = 1),
            ),
        )
        val harness = CreateEventHarness(sports = listOf(sport))
        advance()

        harness.component.updateEventField { copy(sportId = sport.id) }
        advance()

        val seededPositionId = harness.component.newEventState.value.officialPositions.single().id
        harness.component.updateEventField {
            removeOfficialPosition(
                positionId = seededPositionId,
                sport = sport,
            )
        }
        advance()

        val clearedEvent = harness.component.newEventState.value
        assertTrue(clearedEvent.officialPositions.isEmpty())

        harness.component.updateEventField {
            syncOfficialStaffing(
                sport = sport,
                replacePositionsWithSportDefaults = true,
            )
        }
        advance()

        assertEquals(
            listOf("Referee"),
            harness.component.newEventState.value.officialPositions.map { it.name },
        )
    }

    @Test
    fun switching_sports_does_not_overwrite_custom_event_official_positions() = runTest(testDispatcher) {
        val originalSport = createSport(id = "sport-original", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Referee", count = 1),
            ),
        )
        val nextSport = createSport(id = "sport-next", usePointsPerSetWin = false).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Umpire", count = 1),
            ),
        )
        val harness = CreateEventHarness(sports = listOf(originalSport, nextSport))
        advance()

        harness.component.updateEventField { copy(sportId = originalSport.id) }
        advance()
        harness.component.updateEventField {
            copy(
                officialPositions = listOf(
                    EventOfficialPosition(
                        id = "custom-position",
                        name = "Lead Official",
                        count = 1,
                        order = 0,
                    ),
                ),
            )
        }
        advance()

        harness.component.updateEventField { copy(sportId = nextSport.id) }
        advance()

        assertEquals(
            listOf("Lead Official"),
            harness.component.newEventState.value.officialPositions.map { it.name },
        )
    }

    @Test
    fun pending_staff_invites_merge_roles_by_email_and_reject_duplicate_role_staging() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.addPendingStaffInvite(
            firstName = "Taylor",
            lastName = "Official",
            email = " Taylor@example.com ",
            roles = setOf(EventStaffRole.OFFICIAL),
        ).getOrThrow()
        harness.component.addPendingStaffInvite(
            firstName = "Taylor",
            lastName = "Official",
            email = "taylor@example.com",
            roles = setOf(EventStaffRole.ASSISTANT_HOST),
        ).getOrThrow()

        val pending = harness.component.pendingStaffInvites.value
        assertEquals(1, pending.size)
        assertEquals("taylor@example.com", pending.single().email)
        assertEquals(
            setOf(EventStaffRole.OFFICIAL, EventStaffRole.ASSISTANT_HOST),
            pending.single().roles,
        )

        val duplicate = harness.component.addPendingStaffInvite(
            firstName = "Taylor",
            lastName = "Official",
            email = "taylor@example.com",
            roles = setOf(EventStaffRole.OFFICIAL),
        )
        assertTrue(duplicate.isFailure)
    }

    @Test
    fun pending_staff_invites_reject_email_that_already_belongs_to_assigned_host_side_user() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateAssistantHostIds(listOf("assistant-1"))
        advance()
        harness.userRepository.emailMembershipMatches = listOf(
            com.razumly.mvp.core.data.repositories.UserEmailMembershipMatch(
                email = "assistant@example.com",
                userId = "assistant-1",
            ),
        )

        val result = harness.component.addPendingStaffInvite(
            firstName = "Alex",
            lastName = "Host",
            email = "assistant@example.com",
            roles = setOf(EventStaffRole.ASSISTANT_HOST),
        )

        assertTrue(result.isFailure)
        assertTrue(harness.component.pendingStaffInvites.value.isEmpty())
    }

    @Test
    fun create_event_syncs_staff_invites_with_replace_staff_types() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField { copy(divisions = listOf("Open")) }
        advance()
        harness.component.updateAssistantHostIds(listOf("assistant-1"))
        harness.component.addOfficialId("official-1")
        advance()
        harness.userRepository.createdInvitesResult = listOf(
            Invite(
                type = "STAFF",
                email = "assistant@example.com",
                eventId = harness.component.newEventState.value.id,
                userId = "assistant-1",
                staffTypes = listOf("HOST"),
                id = "invite-assistant",
            ),
            Invite(
                type = "STAFF",
                email = "official@example.com",
                eventId = harness.component.newEventState.value.id,
                userId = "official-1",
                staffTypes = listOf("OFFICIAL"),
                id = "invite-official",
            ),
        )

        harness.component.createEvent()
        advance()

        assertEquals(1, harness.userRepository.createInviteCalls.size)
        val invitePayloads = harness.userRepository.createInviteCalls.single()
        assertEquals(2, invitePayloads.size)
        assertTrue(invitePayloads.all { it.replaceStaffTypes == true })
        assertTrue(invitePayloads.any { it.userId == "assistant-1" && it.staffTypes == listOf("HOST") })
        assertTrue(invitePayloads.any { it.userId == "official-1" && it.staffTypes == listOf("OFFICIAL") })
    }

    @Test
    fun disabling_team_officials_clears_team_official_swap_permission() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateDoTeamsOfficiate(true)
        harness.component.updateTeamOfficialsMaySwap(true)
        advance()

        harness.component.updateDoTeamsOfficiate(false)
        advance()

        val updatedEvent = harness.component.newEventState.value
        assertEquals(false, updatedEvent.doTeamsOfficiate)
        assertEquals(false, updatedEvent.teamOfficialsMaySwap)
    }

    @Test
    fun disabling_team_officials_moves_team_staffing_back_to_schedule_mode() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField {
            copy(
                doTeamsOfficiate = true,
                officialSchedulingMode = OfficialSchedulingMode.TEAM_STAFFING,
            )
        }
        advance()

        harness.component.updateDoTeamsOfficiate(false)
        advance()

        val updatedEvent = harness.component.newEventState.value
        assertEquals(false, updatedEvent.doTeamsOfficiate)
        assertEquals(OfficialSchedulingMode.SCHEDULE, updatedEvent.officialSchedulingMode)
    }

    @Test
    fun payment_plan_mutations_keep_installment_state_in_sync() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.setPaymentPlansEnabled(true)
        advance()
        assertEquals(true, harness.component.newEventState.value.allowPaymentPlans)
        assertEquals(1, harness.component.newEventState.value.installmentCount)
        assertEquals(listOf(0), harness.component.newEventState.value.installmentAmounts)
        assertEquals(listOf(""), harness.component.newEventState.value.installmentDueDates)

        harness.component.updateInstallmentAmount(index = 0, amountCents = 1500)
        harness.component.updateInstallmentDueDate(index = 0, dueDate = " 2026-04-01 ")
        harness.component.addInstallmentRow()
        advance()

        assertEquals(2, harness.component.newEventState.value.installmentCount)
        assertEquals(listOf(1500, 0), harness.component.newEventState.value.installmentAmounts)
        assertEquals(listOf("2026-04-01", ""), harness.component.newEventState.value.installmentDueDates)

        harness.component.setInstallmentCount(3)
        advance()
        assertEquals(3, harness.component.newEventState.value.installmentCount)
        assertEquals(listOf(1500, 0, 0), harness.component.newEventState.value.installmentAmounts)
        assertEquals(listOf("2026-04-01", "", ""), harness.component.newEventState.value.installmentDueDates)

        harness.component.removeInstallmentRow(1)
        advance()
        assertEquals(2, harness.component.newEventState.value.installmentCount)
        assertEquals(listOf(1500, 0), harness.component.newEventState.value.installmentAmounts)
        assertEquals(listOf("2026-04-01", ""), harness.component.newEventState.value.installmentDueDates)

        harness.component.removeInstallmentRow(0)
        harness.component.removeInstallmentRow(0)
        advance()

        assertEquals(false, harness.component.newEventState.value.allowPaymentPlans)
        assertEquals(null, harness.component.newEventState.value.installmentCount)
        assertEquals(emptyList(), harness.component.newEventState.value.installmentAmounts)
        assertEquals(emptyList(), harness.component.newEventState.value.installmentDueDates)
    }

    @Test
    fun switching_sports_with_different_scoring_modes_resets_league_scoring_config() = runTest(testDispatcher) {
        val setBasedSport = createSport(
            id = "sport-sets",
            usePointsPerSetWin = true,
        )
        val timedSport = createSport(
            id = "sport-timed",
            usePointsPerSetWin = false,
        )
        val harness = CreateEventHarness(sports = listOf(setBasedSport, timedSport))
        advance()

        harness.component.updateEventField { copy(sportId = timedSport.id) }
        advance()

        harness.component.updateLeagueScoringConfig {
            copy(
                pointsForWin = 9,
                pointsForDraw = 4,
                pointsForLoss = -2,
                pointsPerSetWin = 1.5,
                pointsPerSetLoss = 0.5,
            )
        }
        assertEquals(9, harness.component.leagueScoringConfig.value.pointsForWin)
        assertEquals(1.5, harness.component.leagueScoringConfig.value.pointsPerSetWin)

        harness.component.updateEventField { copy(sportId = setBasedSport.id) }
        advance()

        assertEquals(LeagueScoringConfigDTO(), harness.component.leagueScoringConfig.value)
    }

    @Test
    fun updating_fields_without_sport_change_keeps_league_scoring_config() = runTest(testDispatcher) {
        val timedSport = createSport(
            id = "sport-timed",
            usePointsPerSetWin = false,
        )
        val harness = CreateEventHarness(sports = listOf(timedSport))
        advance()

        harness.component.updateEventField { copy(sportId = timedSport.id) }
        advance()

        harness.component.updateLeagueScoringConfig {
            copy(
                pointsForWin = 7,
                pointsForDraw = 3,
                pointsForLoss = 0,
            )
        }
        val configured = harness.component.leagueScoringConfig.value

        harness.component.updateEventField {
            copy(
                sportId = timedSport.id,
                name = "League Config Should Stay",
            )
        }
        advance()

        assertEquals(configured, harness.component.leagueScoringConfig.value)
    }

    @Test
    fun selecting_league_or_tournament_enables_open_ended_end_flag() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        assertTrue(harness.component.newEventState.value.noFixedEndDateTime)
        assertFalse(harness.component.useManualTimeSlots.value)

        harness.component.onTypeSelected(EventType.EVENT)
        advance()
        assertFalse(harness.component.newEventState.value.noFixedEndDateTime)

        harness.component.onTypeSelected(EventType.WEEKLY_EVENT)
        advance()
        assertTrue(harness.component.useManualTimeSlots.value)

        harness.component.onTypeSelected(EventType.EVENT)
        advance()
        assertFalse(harness.component.useManualTimeSlots.value)
    }

    @Test
    fun selecting_weekly_event_keeps_existing_team_signup_choice() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField { copy(teamSignup = false) }
        advance()

        harness.component.onTypeSelected(EventType.WEEKLY_EVENT)
        advance()

        assertEquals(EventType.WEEKLY_EVENT, harness.component.newEventState.value.eventType)
        assertFalse(harness.component.newEventState.value.teamSignup)
        assertTrue(harness.component.newEventState.value.noFixedEndDateTime)
        assertFalse(harness.component.newEventState.value.singleDivision)
    }

    @Test
    fun given_loaded_rental_resource_when_selected_then_create_event_attaches_locked_slot_without_checkout() = runTest(testDispatcher) {
        val rentalField = Field(
            fieldNumber = 1,
            organizationId = "owner-org",
            id = "field-rental-main",
            name = "Razumly - Main",
            location = "2130 N Q St",
        ).apply {
            facilityId = "facility-razumly"
            facility = Facility(
                id = "facility-razumly",
                name = "Razumly",
                location = "2130 N Q St",
            )
        }
        val rentalOption = RentalResourceOption(
            id = "rental-option-1",
            bookingId = "booking-1",
            bookingItemId = "booking-item-1",
            organizationId = "owner-org",
            organizationName = "Razumly",
            field = rentalField,
            start = instant(1_700_000_000_000),
            end = instant(1_700_003_600_000),
            timeZone = "UTC",
            priceCents = 27500,
            requiredTemplateIds = listOf("participant-template"),
            hostRequiredTemplateIds = listOf("host-template"),
        )
        val harness = CreateEventHarness(rentalResourceOptions = listOf(rentalOption))
        advance()

        assertEquals(listOf("rental-option-1"), harness.component.availableRentalResources.value.map { option -> option.id })

        harness.component.selectFieldCount(3)
        advance()

        assertEquals(emptyList(), harness.component.localFields.value)
        assertEquals(emptyList(), harness.component.newEventState.value.fieldIds)

        harness.component.setRentalResourceSelected("rental-option-1", true)
        advance()

        harness.component.selectFieldCount(3)
        advance()

        val selectedSlot = harness.component.leagueSlots.value.single()
        assertEquals(setOf("rental-option-1"), harness.component.selectedRentalResourceIds.value)
        assertEquals(listOf("field-rental-main"), harness.component.localFields.value.map { field -> field.id })
        assertEquals(listOf("field-rental-main"), harness.component.newEventState.value.fieldIds)
        assertEquals("RENTAL_BOOKING", selectedSlot.sourceType)
        assertEquals("booking-1", selectedSlot.rentalBookingId)
        assertEquals("booking-item-1", selectedSlot.rentalBookingItemId)
        assertEquals(true, selectedSlot.rentalLocked)
        assertEquals(listOf("field-rental-main"), selectedSlot.scheduledFieldIds)

        harness.component.createEvent()
        advance()

        assertEquals(0, harness.billingRepository.purchaseIntentCalls.size)
        assertEquals(0, harness.billingRepository.rentalSignLinksCalls.size)
        assertEquals(1, harness.eventRepository.createEventCalls.size)
        val createCall = harness.eventRepository.createEventCalls.single()
        val payloadSlot = createCall.timeSlots.orEmpty().single()
        assertEquals(listOf("field-rental-main"), createCall.event.fieldIds)
        assertEquals(listOf(payloadSlot.id), createCall.event.timeSlotIds)
        assertEquals("RENTAL_BOOKING", payloadSlot.sourceType)
        assertEquals("booking-1", payloadSlot.rentalBookingId)
        assertEquals("booking-item-1", payloadSlot.rentalBookingItemId)
        assertEquals(true, payloadSlot.rentalLocked)
        assertEquals(listOf("participant-template"), payloadSlot.requiredTemplateIds)
        assertEquals(listOf("host-template"), payloadSlot.hostRequiredTemplateIds)
    }

    @Test
    fun given_loaded_rental_resource_for_league_when_field_count_changes_then_local_resources_are_created() = runTest(testDispatcher) {
        val rentalField = Field(
            fieldNumber = 1,
            organizationId = "owner-org",
            id = "field-rental-main",
            name = "Razumly - Main",
            location = "2130 N Q St",
        ).apply {
            facilityId = "facility-razumly"
            facility = Facility(
                id = "facility-razumly",
                name = "Razumly",
                location = "2130 N Q St",
            )
        }
        val rentalOption = RentalResourceOption(
            id = "rental-option-1",
            bookingId = "booking-1",
            bookingItemId = "booking-item-1",
            organizationId = "owner-org",
            organizationName = "Razumly",
            field = rentalField,
            start = instant(1_700_000_000_000),
            end = instant(1_700_003_600_000),
            timeZone = "UTC",
            priceCents = 27500,
            requiredTemplateIds = emptyList(),
            hostRequiredTemplateIds = emptyList(),
        )
        val harness = CreateEventHarness(rentalResourceOptions = listOf(rentalOption))
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.setRentalResourceSelected("rental-option-1", true)
        advance()
        harness.component.selectFieldCount(3)
        advance()

        val fieldIds = harness.component.localFields.value.map { field -> field.id }
        assertEquals(3, fieldIds.size)
        assertTrue(fieldIds.contains("field-rental-main"))
        assertEquals(2, fieldIds.count { fieldId -> fieldId != "field-rental-main" })
        assertEquals(fieldIds, harness.component.newEventState.value.fieldIds)
        assertTrue(harness.component.leagueSlots.value.any { slot -> slot.rentalLocked == true })
    }

    @Test
    fun given_loaded_rental_resource_for_league_when_regular_resource_added_to_locked_slot_then_payload_preserves_regular_resource() = runTest(testDispatcher) {
        val rentalField = Field(
            fieldNumber = 1,
            organizationId = "owner-org",
            id = "field-rental-main",
            name = "Razumly - Main",
            location = "2130 N Q St",
        ).apply {
            facilityId = "facility-razumly"
            facility = Facility(
                id = "facility-razumly",
                name = "Razumly",
                location = "2130 N Q St",
            )
        }
        val rentalOption = RentalResourceOption(
            id = "rental-option-1",
            bookingId = "booking-1",
            bookingItemId = "booking-item-1",
            organizationId = "owner-org",
            organizationName = "Razumly",
            field = rentalField,
            start = instant(1_700_000_000_000),
            end = instant(1_700_003_600_000),
            timeZone = "UTC",
            priceCents = 27500,
            requiredTemplateIds = emptyList(),
            hostRequiredTemplateIds = emptyList(),
        )
        val harness = CreateEventHarness(rentalResourceOptions = listOf(rentalOption))
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        harness.component.updateEventField {
            copy(
                name = "Rental Resource League",
                organizationId = "org-rental-resource-league",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        advance()
        harness.component.setRentalResourceSelected("rental-option-1", true)
        harness.component.selectFieldCount(2)
        advance()

        val regularFieldId = harness.component.localFields.value
            .first { field -> field.id != "field-rental-main" }
            .id
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                scheduledFieldId = "field-rental-main",
                scheduledFieldIds = listOf("field-rental-main", regularFieldId),
            )
        }
        advance()

        assertEquals(
            listOf("field-rental-main", regularFieldId),
            harness.component.leagueSlots.value.first().scheduledFieldIds,
        )

        harness.component.createEvent()
        advance()

        val createCall = harness.eventRepository.createEventCalls.single()
        val payloadSlot = createCall.timeSlots.orEmpty().single()
        val createdRegularFieldId = createCall.fields.orEmpty()
            .first { field -> field.id != "field-rental-main" }
            .id
        assertEquals("field-rental-main", payloadSlot.scheduledFieldId)
        assertEquals(listOf("field-rental-main", createdRegularFieldId), payloadSlot.scheduledFieldIds)
    }

    @Test
    fun given_mismatched_rental_field_added_to_locked_slot_when_updated_then_mismatched_rental_is_removed() = runTest(testDispatcher) {
        val mainRentalField = Field(
            fieldNumber = 1,
            organizationId = "owner-org",
            id = "field-rental-main",
            name = "Razumly - Main",
            location = "2130 N Q St",
        )
        val annexRentalField = Field(
            fieldNumber = 2,
            organizationId = "owner-org",
            id = "field-rental-annex",
            name = "Razumly - Annex",
            location = "455 2nd St",
        )
        val mainRental = RentalResourceOption(
            id = "rental-option-1",
            bookingId = "booking-1",
            bookingItemId = "booking-item-1",
            organizationId = "owner-org",
            field = mainRentalField,
            start = instant(1_700_000_000_000),
            end = instant(1_700_003_600_000),
            timeZone = "UTC",
            priceCents = 27500,
        )
        val annexRental = RentalResourceOption(
            id = "rental-option-2",
            bookingId = "booking-2",
            bookingItemId = "booking-item-2",
            organizationId = "owner-org",
            field = annexRentalField,
            start = instant(1_700_086_400_000),
            end = instant(1_700_090_000_000),
            timeZone = "UTC",
            priceCents = 27500,
        )
        val harness = CreateEventHarness(rentalResourceOptions = listOf(mainRental, annexRental))
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.setRentalResourceSelected("rental-option-1", true)
        harness.component.setRentalResourceSelected("rental-option-2", true)
        advance()

        val mainSlotIndex = harness.component.leagueSlots.value.indexOfFirst { slot ->
            slot.rentalBookingItemId == "booking-item-1"
        }
        harness.component.updateLeagueTimeSlot(mainSlotIndex) {
            copy(
                scheduledFieldId = "field-rental-main",
                scheduledFieldIds = listOf("field-rental-main", "field-rental-annex"),
            )
        }
        advance()

        val mainSlot = harness.component.leagueSlots.value[mainSlotIndex]
        assertEquals(listOf("field-rental-main"), mainSlot.scheduledFieldIds)
        assertFalse(mainSlot.scheduledFieldIds.orEmpty().contains("field-rental-annex"))
    }

    @Test
    fun given_rental_resource_when_added_to_custom_timeslot_then_rental_field_is_removed() = runTest(testDispatcher) {
        val rentalField = Field(
            fieldNumber = 1,
            organizationId = "owner-org",
            id = "field-rental-main",
            name = "Razumly - Main",
            location = "2130 N Q St",
        )
        val rentalOption = RentalResourceOption(
            id = "rental-option-1",
            bookingId = "booking-1",
            bookingItemId = "booking-item-1",
            organizationId = "owner-org",
            field = rentalField,
            start = instant(1_700_000_000_000),
            end = instant(1_700_003_600_000),
            timeZone = "UTC",
            priceCents = 27500,
        )
        val harness = CreateEventHarness(rentalResourceOptions = listOf(rentalOption))
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        harness.component.updateEventField {
            copy(
                name = "Rental Resource League",
                organizationId = "org-rental-resource-league",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        advance()
        harness.component.setRentalResourceSelected("rental-option-1", true)
        harness.component.selectFieldCount(2)
        advance()

        val regularFieldId = harness.component.localFields.value
            .first { field -> field.id != "field-rental-main" }
            .id
        harness.component.addLeagueTimeSlot()
        val customSlotIndex = harness.component.leagueSlots.value.lastIndex
        harness.component.updateLeagueTimeSlot(customSlotIndex) {
            copy(
                dayOfWeek = 2,
                daysOfWeek = listOf(2),
                startTimeMinutes = 8 * 60,
                endTimeMinutes = 9 * 60,
                startDate = instant(1_700_172_800_000),
                endDate = instant(1_700_176_400_000),
                repeating = false,
                scheduledFieldId = "field-rental-main",
                scheduledFieldIds = listOf("field-rental-main", regularFieldId),
            )
        }
        advance()

        val customSlot = harness.component.leagueSlots.value[customSlotIndex]
        assertNull(customSlot.rentalBookingItemId)
        assertEquals(listOf(regularFieldId), customSlot.scheduledFieldIds)

        harness.component.createEvent()
        advance()

        val createCall = harness.eventRepository.createEventCalls.single()
        val customPayloadSlots = createCall.timeSlots.orEmpty()
            .filterNot { slot -> slot.rentalBookingItemId == "booking-item-1" }
        assertTrue(customPayloadSlots.isNotEmpty())
        assertTrue(customPayloadSlots.none { slot -> slot.scheduledFieldIds.orEmpty().contains("field-rental-main") })
    }

    @Test
    fun given_league_slots_when_field_count_reduced_then_invalid_scheduled_field_ids_are_cleared() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(2)
        advance()
        val fieldIds = harness.component.localFields.value.map { it.id }

        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 2,
                startTimeMinutes = 60,
                endTimeMinutes = 120,
                scheduledFieldId = fieldIds[1],
            )
        }
        advance()

        harness.component.selectFieldCount(1)
        advance()

        assertEquals(1, harness.component.localFields.value.size)
        assertNull(harness.component.leagueSlots.value.first().scheduledFieldId)
        assertEquals(emptyList(), harness.component.leagueSlots.value.first().scheduledFieldIds)
    }

    @Test
    fun given_league_creation_when_fields_and_slots_submitted_then_only_valid_slots_are_created_and_mapped() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(2)
        advance()
        val localFieldIds = harness.component.localFields.value.map { it.id }
        harness.component.setUseManualTimeSlots(true)
        advance()

        harness.component.updateEventField {
            copy(
                name = "League Create Test",
                location = "Tournament Center",
                organizationId = "org-123",
                divisions = listOf("B", "Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLocalFieldDivisions(0, listOf("A"))
        harness.component.updateLocalFieldDivisions(1, emptyList())
        advance()

        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 1,
                daysOfWeek = listOf(1, 3),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = localFieldIds[0],
            )
        }
        harness.component.addLeagueTimeSlot()
        harness.component.updateLeagueTimeSlot(1) {
            copy(
                dayOfWeek = 2,
                startTimeMinutes = 700,
                endTimeMinutes = 650,
                scheduledFieldId = localFieldIds[1],
            )
        }
        harness.component.updateLeagueScoringConfig {
            copy(
                pointsForWin = 3,
                pointsForLoss = 0,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(1, harness.eventRepository.createEventCalls.size)
        assertEquals(1, harness.onEventCreatedCount)
        assertEquals(0, harness.fieldRepository.createdFields.size)
        assertEquals(0, harness.fieldRepository.createdTimeSlots.size)

        val createCall = harness.eventRepository.createEventCalls.single()
        val payloadFields = createCall.fields.orEmpty()
        val payloadSlots = createCall.timeSlots.orEmpty()
        val createdFieldIds = payloadFields.map { it.id }

        assertEquals(2, payloadFields.size)
        assertEquals(1, payloadSlots.size)
        assertEquals(createdFieldIds, createCall.event.fieldIds)
        assertEquals(payloadSlots.map { it.id }, createCall.event.timeSlotIds)
        assertEquals(listOf("a"), payloadFields[0].divisions)
        assertEquals(listOf("b", "open"), payloadFields[1].divisions)
        assertEquals("Tournament Center", payloadFields[0].location)
        assertEquals("Tournament Center", payloadFields[1].location)
        assertEquals(createdFieldIds.first(), payloadSlots[0].scheduledFieldId)
        assertEquals(listOf(createdFieldIds.first()), payloadSlots[0].scheduledFieldIds)
        assertEquals(1, payloadSlots[0].dayOfWeek)
        assertEquals(listOf(1, 3), payloadSlots[0].daysOfWeek)
        assertEquals(3, createCall.leagueScoringConfig?.pointsForWin)
        assertEquals(emptyList(), createCall.requiredTemplateIds)
    }

    @Test
    fun given_repeating_league_slot_without_end_time_when_submitted_then_slot_is_filtered_from_payload() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        val localFieldId = harness.component.localFields.value.first().id
        harness.component.setUseManualTimeSlots(true)
        advance()

        harness.component.updateEventField {
            copy(
                name = "League Missing End Time",
                organizationId = "org-missing-end-time",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                repeating = true,
                dayOfWeek = 1,
                daysOfWeek = listOf(1),
                startTimeMinutes = 600,
                endTimeMinutes = null,
                scheduledFieldId = localFieldId,
                scheduledFieldIds = listOf(localFieldId),
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createCall = harness.eventRepository.createEventCalls.single()
        assertEquals(emptyList(), createCall.timeSlots.orEmpty())
        assertEquals(emptyList(), createCall.event.timeSlotIds)
    }

    @Test
    fun given_added_league_slot_when_event_has_fixed_end_then_default_slot_end_date_uses_event_end_date_only() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()

        val eventStart = instant(1_700_000_000_000)
        val eventEnd = instant(1_700_003_600_000)
        harness.component.updateEventField {
            copy(
                start = eventStart,
                end = eventEnd,
                noFixedEndDateTime = false,
            )
        }
        advance()

        harness.component.addLeagueTimeSlot()
        advance()

        val addedSlot = harness.component.leagueSlots.value.last()
        val timezone = TimeZone.currentSystemDefault()
        val expectedDateOnlyEnd = eventEnd.toLocalDateTime(timezone).date.atStartOfDayIn(timezone)
        assertEquals(expectedDateOnlyEnd, addedSlot.endDate)
    }

    @Test
    fun given_added_league_slot_when_event_has_no_fixed_end_then_default_slot_end_date_is_null() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()

        harness.component.updateEventField {
            copy(
                start = instant(1_700_000_000_000),
                end = instant(1_700_003_600_000),
                noFixedEndDateTime = true,
            )
        }
        advance()

        harness.component.addLeagueTimeSlot()
        advance()

        val addedSlot = harness.component.leagueSlots.value.last()
        assertNull(addedSlot.endDate)
    }

    @Test
    fun given_fixed_end_league_with_manual_timeslots_disabled_when_submitted_then_single_event_range_slot_is_created() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(2)
        advance()

        val eventStart = instant(1_700_000_000_000)
        val eventEnd = instant(1_700_003_600_000)
        harness.component.updateEventField {
            copy(
                name = "League Auto Slot",
                organizationId = "org-auto-slot",
                divisions = listOf("Open"),
                start = eventStart,
                end = eventEnd,
                noFixedEndDateTime = false,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createCall = harness.eventRepository.createEventCalls.single()
        val createdFieldIds = createCall.fields.orEmpty().map { field -> field.id }
        val createdSlots = createCall.timeSlots.orEmpty()

        assertEquals(1, createdSlots.size)
        assertFalse(createdSlots[0].repeating)
        assertEquals(eventStart, createdSlots[0].startDate)
        assertEquals(eventEnd, createdSlots[0].endDate)
        assertEquals(createdFieldIds.first(), createdSlots[0].scheduledFieldId)
        assertEquals(createdFieldIds, createdSlots[0].scheduledFieldIds)
        assertEquals(listOf(createdSlots[0].id), createCall.event.timeSlotIds)
    }

    @Test
    fun given_fixed_end_league_with_manual_timeslots_enabled_when_submitted_then_configured_slot_is_preserved() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        val localFieldId = harness.component.localFields.value.first().id
        harness.component.setUseManualTimeSlots(true)
        advance()

        harness.component.updateEventField {
            copy(
                name = "League Manual Slot",
                organizationId = "org-manual-slot",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
                noFixedEndDateTime = false,
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                repeating = true,
                startDate = instant(1_700_000_000_000),
                endDate = null,
                dayOfWeek = 1,
                daysOfWeek = listOf(1, 3),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = localFieldId,
                scheduledFieldIds = listOf(localFieldId),
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createdSlots = harness.eventRepository.createEventCalls.single().timeSlots.orEmpty()
        val timezone = TimeZone.currentSystemDefault()
        val expectedDateOnlyEnd = instant(1_700_086_400_000).toLocalDateTime(timezone).date.atStartOfDayIn(timezone)
        assertEquals(1, createdSlots.size)
        assertTrue(createdSlots[0].repeating)
        assertEquals(listOf(1, 3), createdSlots[0].daysOfWeek)
        assertEquals(600, createdSlots[0].startTimeMinutes)
        assertEquals(660, createdSlots[0].endTimeMinutes)
        assertEquals(expectedDateOnlyEnd, createdSlots[0].endDate)
    }

    @Test
    fun switching_to_tournament_clears_repeating_slot_end_dates() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()

        val eventStart = instant(1_700_000_000_000)
        val eventEnd = instant(1_700_086_400_000)
        val timezone = TimeZone.currentSystemDefault()
        val expectedDateOnlyEnd = eventEnd.toLocalDateTime(timezone).date.atStartOfDayIn(timezone)

        harness.component.updateEventField {
            copy(
                start = eventStart,
                end = eventEnd,
                noFixedEndDateTime = false,
            )
        }
        advance()

        harness.component.addLeagueTimeSlot()
        advance()
        assertEquals(expectedDateOnlyEnd, harness.component.leagueSlots.value.last().endDate)

        harness.component.onTypeSelected(EventType.TOURNAMENT)
        advance()

        assertTrue(harness.component.leagueSlots.value.all { slot -> slot.endDate == null })
    }

    @Test
    fun given_repeating_league_slot_with_custom_start_date_when_submitted_then_custom_start_date_is_preserved() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        val localFieldId = harness.component.localFields.value.first().id
        harness.component.setUseManualTimeSlots(true)
        advance()
        val eventStart = instant(1_700_000_000_000)
        val customSlotStart = instant(1_700_172_800_000)

        harness.component.updateEventField {
            copy(
                name = "League Custom Slot Start",
                organizationId = "org-slot-start",
                divisions = listOf("Open"),
                start = eventStart,
                end = instant(1_700_259_200_000),
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                repeating = true,
                startDate = customSlotStart,
                dayOfWeek = 1,
                daysOfWeek = listOf(1, 3),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = localFieldId,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createdSlots = harness.eventRepository.createEventCalls.single().timeSlots.orEmpty()
        assertEquals(1, createdSlots.size)
        assertEquals(true, createdSlots[0].repeating)
        assertEquals(customSlotStart, createdSlots[0].startDate)
    }

    @Test
    fun given_one_time_league_slot_when_submitted_then_datetime_range_is_persisted_and_derived_weekday_time_fields_are_set() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        val localFieldId = harness.component.localFields.value.first().id
        harness.component.setUseManualTimeSlots(true)
        advance()
        val slotStart = instant(1_700_000_000_000)
        val slotEnd = instant(1_700_003_600_000)
        val timezone = TimeZone.currentSystemDefault()
        val localStart = slotStart.toLocalDateTime(timezone)
        val localEnd = slotEnd.toLocalDateTime(timezone)
        val expectedDay = (localStart.date.dayOfWeek.isoDayNumber - 1).mod(7)
        val expectedStartMinutes = localStart.time.hour * 60 + localStart.time.minute
        val expectedEndMinutes = localEnd.time.hour * 60 + localEnd.time.minute

        harness.component.updateEventField {
            copy(
                name = "League One-Time Slot",
                organizationId = "org-one-time",
                divisions = listOf("Open"),
                start = instant(1_699_913_600_000),
                end = instant(1_700_345_600_000),
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                repeating = false,
                startDate = slotStart,
                endDate = slotEnd,
                dayOfWeek = null,
                daysOfWeek = emptyList(),
                startTimeMinutes = null,
                endTimeMinutes = null,
                scheduledFieldId = localFieldId,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createdSlots = harness.eventRepository.createEventCalls.single().timeSlots.orEmpty()
        assertEquals(1, createdSlots.size)
        assertEquals(false, createdSlots[0].repeating)
        assertEquals(slotStart, createdSlots[0].startDate)
        assertEquals(slotEnd, createdSlots[0].endDate)
        assertEquals(expectedDay, createdSlots[0].dayOfWeek)
        assertEquals(listOf(expectedDay), createdSlots[0].daysOfWeek)
        assertEquals(expectedStartMinutes, createdSlots[0].startTimeMinutes)
        assertEquals(expectedEndMinutes, createdSlots[0].endTimeMinutes)
    }

    @Test
    fun given_league_creation_with_no_event_divisions_when_submitted_then_creation_is_blocked() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        harness.component.setUseManualTimeSlots(true)
        advance()

        harness.component.updateEventField {
            copy(
                name = "League Field Division Fallback",
                organizationId = "org-open",
                divisions = emptyList(),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLocalFieldDivisions(0, emptyList())
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 2,
                daysOfWeek = listOf(2),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = harness.component.localFields.value.first().id,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(0, harness.eventRepository.createEventCalls.size)
        assertEquals(
            "Add at least one division before creating this event.",
            harness.component.errorState.value?.message,
        )
    }

    @Test
    fun given_league_creation_with_multi_field_slot_selection_when_submitted_then_slot_is_persisted_canonically() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(2)
        advance()
        val localFieldIds = harness.component.localFields.value.map { it.id }
        harness.component.setUseManualTimeSlots(true)
        advance()

        harness.component.updateEventField {
            copy(
                name = "League Multi-Field Slot",
                organizationId = "org-multi",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 1,
                daysOfWeek = listOf(1, 3),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = localFieldIds.first(),
                scheduledFieldIds = localFieldIds,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createCall = harness.eventRepository.createEventCalls.single()
        val createdSlots = createCall.timeSlots.orEmpty()
        val createdFieldIds = createCall.fields.orEmpty().map { field -> field.id }
        assertEquals(1, createdSlots.size)
        assertEquals(1, createdSlots[0].dayOfWeek)
        assertEquals(listOf(1, 3), createdSlots[0].daysOfWeek)
        assertEquals(createdFieldIds[0], createdSlots[0].scheduledFieldId)
        assertEquals(createdFieldIds, createdSlots[0].scheduledFieldIds)
    }

    @Test
    fun given_league_creation_with_multi_division_timeslots_when_submitted_then_slot_divisions_are_preserved() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        val fieldId = harness.component.localFields.value.first().id
        harness.component.setUseManualTimeSlots(true)
        advance()

        harness.component.updateEventField {
            copy(
                name = "League Split Division Slots",
                organizationId = "org-split",
                singleDivision = false,
                allowTeamSplitDefault = false,
                divisions = listOf("division_a", "division_b"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 1,
                daysOfWeek = listOf(1),
                divisions = listOf("division_a"),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = fieldId,
                scheduledFieldIds = listOf(fieldId),
            )
        }
        harness.component.addLeagueTimeSlot()
        harness.component.updateLeagueTimeSlot(1) {
            copy(
                dayOfWeek = 2,
                daysOfWeek = listOf(2),
                divisions = listOf("division_b"),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = fieldId,
                scheduledFieldIds = listOf(fieldId),
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createdSlots = harness.eventRepository.createEventCalls.single().timeSlots.orEmpty()
        assertEquals(2, createdSlots.size)
        assertEquals(listOf("division_a"), createdSlots[0].divisions)
        assertEquals(listOf("division_b"), createdSlots[1].divisions)
    }

    @Test
    fun given_tournament_creation_when_submitted_then_fields_are_created_without_league_slots_or_scoring_config() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.TOURNAMENT)
        advance()
        harness.component.selectFieldCount(1)
        advance()

        harness.component.updateEventField {
            copy(
                name = "Tournament Create Test",
                organizationId = "org-456",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
                noFixedEndDateTime = false,
            )
        }
        harness.component.addLeagueTimeSlot()
        harness.component.updateLeagueScoringConfig { copy(pointsForWin = 9) }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(1, harness.eventRepository.createEventCalls.size)
        assertEquals(1, harness.onEventCreatedCount)
        assertEquals(0, harness.fieldRepository.createdFields.size)
        assertEquals(0, harness.fieldRepository.createdTimeSlots.size)

        val createCall = harness.eventRepository.createEventCalls.single()
        assertEquals(1, createCall.fields.orEmpty().size)
        assertEquals(1, createCall.timeSlots.orEmpty().size)
        assertEquals(createCall.timeSlots.orEmpty().map { slot -> slot.id }, createCall.event.timeSlotIds)
        assertNull(createCall.leagueScoringConfig)
    }
}
