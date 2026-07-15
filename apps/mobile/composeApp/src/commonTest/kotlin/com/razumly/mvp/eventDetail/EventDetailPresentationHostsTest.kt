package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.SignStep
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventDetailPresentationHostsTest {
    @Test
    fun givenTournament_whenResolvingEditActions_thenSchedulingAndBracketActionsAreAvailable() {
        val availability = eventEditActionAvailability(
            event = Event(eventType = EventType.TOURNAMENT, state = "PUBLISHED"),
            isHost = true,
        )

        assertTrue(availability.canReschedule)
        assertTrue(availability.canBuildBrackets)
        assertTrue(availability.eventActionEnabled)
        assertTrue(availability.canCreateTemplate)
    }

    @Test
    fun givenLeagueWithoutPlayoffs_whenResolvingEditActions_thenBracketActionIsHidden() {
        val availability = eventEditActionAvailability(
            event = Event(
                eventType = EventType.LEAGUE,
                includePlayoffs = false,
                state = "PUBLISHED",
            ),
            isHost = true,
        )

        assertTrue(availability.canReschedule)
        assertFalse(availability.canBuildBrackets)
    }

    @Test
    fun givenTemplateOrOrganizationEvent_whenResolvingEditActions_thenTemplateCreationIsUnavailable() {
        assertFalse(
            eventEditActionAvailability(
                event = Event(state = "TEMPLATE"),
                isHost = true,
            ).canCreateTemplate,
        )
        assertFalse(
            eventEditActionAvailability(
                event = Event(state = "PUBLISHED", organizationId = "org-1"),
                isHost = true,
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

    private fun stickyAction(
        isAffiliateEvent: Boolean = false,
        isRegistrationPaymentPending: Boolean = false,
        isRegistrationPaymentFailed: Boolean = false,
        joinBlockedByStart: Boolean = false,
        isWeeklyParentEvent: Boolean = false,
        shouldShowViewSchedulePrimaryAction: Boolean = false,
        isUserInEvent: Boolean = false,
    ): EventDetailStickyPrimaryAction = resolveEventDetailStickyPrimaryAction(
        isAffiliateEvent = isAffiliateEvent,
        isRegistrationPaymentPending = isRegistrationPaymentPending,
        isRegistrationPaymentFailed = isRegistrationPaymentFailed,
        joinBlockedByStart = joinBlockedByStart,
        isWeeklyParentEvent = isWeeklyParentEvent,
        shouldShowViewSchedulePrimaryAction = shouldShowViewSchedulePrimaryAction,
        isUserInEvent = isUserInEvent,
    )
}
