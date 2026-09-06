package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.network.dto.EventEditorMaintenanceOperation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailPresentationHostsTest {
    @Test
    fun givenTournament_whenResolvingEditActions_thenScheduleActionsAreAvailable() {
        val event = Event(
            id = "event-tournament",
            eventType = EventType.TOURNAMENT,
            isAutomatedScheduling = true,
            state = "PUBLISHED",
        )
        val availability = eventEditActionAvailability(
            event = event,
            isHost = false,
            eventEditorSnapshot = maintenanceEditorSnapshot(
                event = event,
                operations = listOf(
                    EventEditorMaintenanceOperation.BUILD,
                    EventEditorMaintenanceOperation.COMPLETE,
                    EventEditorMaintenanceOperation.REBUILD,
                ),
            ),
        )

        assertTrue(availability.canReschedule)
        assertTrue(availability.canBuildSchedule)
        assertTrue(availability.canRebuildWithoutPlaceholders)
        assertTrue(availability.eventActionEnabled)
        assertFalse(availability.canCreateTemplate)
    }

    @Test
    fun givenLeagueWithoutPlayoffs_whenResolvingEditActions_thenBuildScheduleIsAvailable() {
        val event = Event(
            id = "event-league",
            eventType = EventType.LEAGUE,
            includePlayoffs = false,
            isAutomatedScheduling = true,
            state = "PUBLISHED",
        )
        val availability = eventEditActionAvailability(
            event = event,
            isHost = true,
            eventEditorSnapshot = maintenanceEditorSnapshot(
                event = event,
                operations = listOf(EventEditorMaintenanceOperation.BUILD),
            ),
        )

        assertFalse(availability.canReschedule)
        assertTrue(availability.canBuildSchedule)
    }

    @Test
    fun givenLeagueDraftWithAutomationDisabled_whenResolvingEditActions_thenScheduleActionsAreUnavailable() {
        val authoritativeEvent = Event(
            id = "event-league",
            eventType = EventType.LEAGUE,
            isAutomatedScheduling = true,
            state = "PUBLISHED",
        )
        val availability = eventEditActionAvailability(
            event = authoritativeEvent.copy(isAutomatedScheduling = false),
            isHost = true,
            eventEditorSnapshot = maintenanceEditorSnapshot(
                event = authoritativeEvent,
                operations = listOf(
                    EventEditorMaintenanceOperation.BUILD,
                    EventEditorMaintenanceOperation.COMPLETE,
                    EventEditorMaintenanceOperation.REBUILD,
                ),
            ),
        )

        assertFalse(availability.canReschedule)
        assertFalse(availability.canBuildSchedule)
        assertFalse(availability.canRebuildWithoutPlaceholders)
        assertTrue(availability.eventActionEnabled)
        assertTrue(availability.canCreateTemplate)
    }

    @Test
    fun givenDraftTypeChangedAwayFromLeagueOrTournament_whenResolvingEditActions_thenScheduleActionsAreUnavailable() {
        val authoritativeEvent = Event(
            id = "event-league",
            eventType = EventType.LEAGUE,
            isAutomatedScheduling = true,
            state = "PUBLISHED",
        )
        val availability = eventEditActionAvailability(
            event = authoritativeEvent.copy(eventType = EventType.EVENT),
            isHost = true,
            eventEditorSnapshot = maintenanceEditorSnapshot(
                event = authoritativeEvent,
                operations = listOf(
                    EventEditorMaintenanceOperation.BUILD,
                    EventEditorMaintenanceOperation.COMPLETE,
                    EventEditorMaintenanceOperation.REBUILD,
                ),
            ),
        )

        assertFalse(availability.canReschedule)
        assertFalse(availability.canBuildSchedule)
        assertFalse(availability.canRebuildWithoutPlaceholders)
    }

    @Test
    fun given_local_event_without_server_projection_when_resolving_edit_actions_then_schedule_actions_are_unavailable() {
        val availability = eventEditActionAvailability(
            event = Event(
                id = "event-without-snapshot",
                eventType = EventType.TOURNAMENT,
                state = "PUBLISHED",
                teamIds = listOf("team-1", "team-2"),
            ),
            isHost = true,
            eventEditorSnapshot = null,
        )

        assertFalse(availability.canReschedule)
        assertFalse(availability.canBuildSchedule)
        assertFalse(availability.canRebuildWithoutPlaceholders)
    }

    @Test
    fun given_template_or_read_only_snapshot_when_resolving_edit_actions_then_schedule_actions_are_unavailable() {
        val templateEvent = Event(
            id = "template-event",
            eventType = EventType.TOURNAMENT,
            isAutomatedScheduling = true,
            state = "TEMPLATE",
        )
        val readOnlyEvent = templateEvent.copy(
            id = "read-only-event",
            state = "PUBLISHED",
        )
        val operations = listOf(
            EventEditorMaintenanceOperation.BUILD,
            EventEditorMaintenanceOperation.COMPLETE,
            EventEditorMaintenanceOperation.REBUILD,
        )

        val templateAvailability = eventEditActionAvailability(
            event = templateEvent,
            isHost = true,
            eventEditorSnapshot = maintenanceEditorSnapshot(templateEvent, operations),
        )
        val readOnlyAvailability = eventEditActionAvailability(
            event = readOnlyEvent,
            isHost = true,
            eventEditorSnapshot = maintenanceEditorSnapshot(
                event = readOnlyEvent,
                operations = operations,
                canEdit = false,
            ),
        )

        listOf(templateAvailability, readOnlyAvailability).forEach { availability ->
            assertFalse(availability.canReschedule)
            assertFalse(availability.canBuildSchedule)
            assertFalse(availability.canRebuildWithoutPlaceholders)
        }
    }


    @Test
    fun givenTemplateOrOrganizationEvent_whenResolvingEditActions_thenTemplateActionMatchesDisplayPolicy() {
        assertFalse(
            eventEditActionAvailability(
                event = Event(state = "TEMPLATE"),
                isHost = true,
                eventEditorSnapshot = null,
            ).canCreateTemplate,
        )
        assertTrue(
            eventEditActionAvailability(
                event = Event(state = "PUBLISHED", organizationId = "org-1"),
                isHost = true,
                eventEditorSnapshot = null,
            ).canCreateTemplate,
        )
    }

    @Test
    fun givenTemplatePaidOrFreeEvent_whenBuildingDeleteCopy_thenCorrectWarningIsReturned() {
        assertEquals(
            "Are you sure you want to delete this template? This action cannot be undone.",
            eventDeleteConfirmationMessage(isTemplateEvent = true, hasAnyPaidDivision = true),
        )
        assertEquals(
            "Are you sure you want to delete this event? All participants will receive a full refund. " +
                "This action cannot be undone.",
            eventDeleteConfirmationMessage(isTemplateEvent = false, hasAnyPaidDivision = true),
        )
        assertEquals(
            "Are you sure you want to delete this event? This action cannot be undone.",
            eventDeleteConfirmationMessage(isTemplateEvent = false, hasAnyPaidDivision = false),
        )
    }

    @Test
    fun givenMultiStepSignatureWithSigner_whenBuildingDescription_thenBothLabelsAreShown() {
        val description = webSignatureDescription(
            WebSignaturePromptState(
                step = SignStep(
                    templateId = "template-1",
                    requiredSignerLabel = "Parent or guardian",
                ),
                url = "https://example.test/sign",
                currentStep = 2,
                totalSteps = 3,
            ),
        )

        assertEquals(
            "Document 2 of 3 - Required signer: Parent or guardian",
            description,
        )
    }

    @Test
    fun givenSingleStepSignatureWithoutSigner_whenBuildingDescription_thenDescriptionIsEmpty() {
        assertEquals(
            "",
            webSignatureDescription(
                WebSignaturePromptState(
                    step = null,
                    url = "https://example.test/sign",
                    currentStep = 1,
                    totalSteps = 1,
                ),
            ),
        )
    }

    @Test
    fun givenAffiliateEvent_whenResolvingStickyAction_thenWebsiteRegistrationWins() {
        assertEquals(
            EventDetailStickyPrimaryAction(
                label = "Register on website",
                enabled = true,
                intent = EventDetailStickyPrimaryIntent.AFFILIATE_JOIN,
            ),
            stickyAction(
                isAffiliateEvent = true,
                isRegistrationPaymentPending = true,
            ),
        )
    }

    @Test
    fun givenPendingWeeklyRegistration_whenResolvingStickyAction_thenActionIsDisabled() {
        assertEquals(
            EventDetailStickyPrimaryAction(
                label = "Payment pending",
                enabled = false,
                intent = EventDetailStickyPrimaryIntent.NONE,
            ),
            stickyAction(
                isRegistrationPaymentPending = true,
                isWeeklyParentEvent = true,
            ),
        )
    }

    @Test
    fun givenJoinedViewer_whenResolvingStickyAction_thenScheduleActionIsEnabled() {
        assertEquals(
            EventDetailStickyPrimaryAction(
                label = "View Schedule and Participants",
                enabled = true,
                intent = EventDetailStickyPrimaryIntent.VIEW_EVENT,
            ),
            stickyAction(
                shouldShowViewSchedulePrimaryAction = true,
                isUserInEvent = true,
            ),
        )
    }

    @Test
    fun givenStartedWeeklyOccurrence_whenResolvingStickyAction_thenStartedStateIsDisabled() {
        assertEquals(
            EventDetailStickyPrimaryAction(
                label = "Occurrence Started",
                enabled = false,
                intent = EventDetailStickyPrimaryIntent.NONE,
            ),
            stickyAction(
                joinBlockedByStart = true,
                isWeeklyParentEvent = true,
            ),
        )
    }

    @Test
    fun givenArchivedEvent_whenResolvingStickyAction_thenRegistrationIsDisabled() {
        assertEquals(
            EventDetailStickyPrimaryAction(
                label = "Archived",
                enabled = false,
                intent = EventDetailStickyPrimaryIntent.NONE,
            ),
            stickyAction(isArchivedEvent = true, isAffiliateEvent = true),
        )
    }

    @Test
    fun givenSavedRegistration_whenResolvingStickyAction_thenOffersContinueRegistration() {
        assertEquals("Continue registration", stickyAction(hasSavedRegistration = true).label)
        assertEquals(EventDetailStickyPrimaryIntent.OPEN_JOIN_OPTIONS, stickyAction(hasSavedRegistration = true).intent)
        assertEquals("Archived", stickyAction(hasSavedRegistration = true, isArchivedEvent = true).label)
        assertEquals(EventDetailStickyPrimaryIntent.OPEN_JOIN_OPTIONS,
            stickyAction(hasSavedRegistration = true, shouldShowViewSchedulePrimaryAction = true).intent)
    }

    private fun stickyAction(
        isAffiliateEvent: Boolean = false,
        isRegistrationPaymentPending: Boolean = false,
        isRegistrationPaymentFailed: Boolean = false,
        joinBlockedByStart: Boolean = false,
        isWeeklyParentEvent: Boolean = false,
        shouldShowViewSchedulePrimaryAction: Boolean = false,
        isUserInEvent: Boolean = false,
        isArchivedEvent: Boolean = false,
        hasSavedRegistration: Boolean = false,
    ): EventDetailStickyPrimaryAction = resolveEventDetailStickyPrimaryAction(
        isAffiliateEvent = isAffiliateEvent,
        isRegistrationPaymentPending = isRegistrationPaymentPending,
        isRegistrationPaymentFailed = isRegistrationPaymentFailed,
        joinBlockedByStart = joinBlockedByStart,
        isWeeklyParentEvent = isWeeklyParentEvent,
        shouldShowViewSchedulePrimaryAction = shouldShowViewSchedulePrimaryAction,
        isUserInEvent = isUserInEvent,
        isArchivedEvent = isArchivedEvent,
        hasSavedRegistration = hasSavedRegistration,
    )
}

private fun maintenanceEditorSnapshot(
    event: Event,
    operations: List<EventEditorMaintenanceOperation>,
    canEdit: Boolean = true,
) = com.razumly.mvp.eventCreate.createEventEditorSession(event).snapshot.copy(
    mode = "EDIT",
    eventId = event.id,
    capabilities = com.razumly.mvp.core.network.dto.EventEditorCapabilitiesDto(
        canUseOnlinePayments = true,
        canManageStaff = true,
        canEdit = canEdit,
        supportsTeamStaffing = true,
    ),
    scheduleState = com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto(
        sourceType = "GENERATED",
        matchCount = event.teamIds.size,
        revision = "schedule-revision-1",
        hasProtectedHistory = false,
        availableMaintenanceOperations = operations,
    ),
)
