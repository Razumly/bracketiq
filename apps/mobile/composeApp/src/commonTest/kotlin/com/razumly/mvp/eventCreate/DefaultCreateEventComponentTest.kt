package com.razumly.mvp.eventCreate

import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.DivisionDetail
import com.razumly.mvp.core.data.dataTypes.Organization
import com.razumly.mvp.core.data.dataTypes.OrganizationFeature
import com.razumly.mvp.core.data.dataTypes.Invite
import com.razumly.mvp.core.data.dataTypes.EventOfficialPosition
import com.razumly.mvp.core.data.dataTypes.Facility
import com.razumly.mvp.core.data.dataTypes.Field
import com.razumly.mvp.core.data.dataTypes.LeagueScoringConfigDTO
import com.razumly.mvp.core.data.dataTypes.StaffingPriority
import com.razumly.mvp.core.data.dataTypes.SportOfficialPositionTemplate
import com.razumly.mvp.core.data.dataTypes.TimeSlot
import com.razumly.mvp.core.data.dataTypes.removeOfficialPosition
import com.razumly.mvp.core.data.dataTypes.syncOfficialStaffing
import com.razumly.mvp.core.data.dataTypes.enums.EventType
import com.razumly.mvp.core.data.repositories.RentalResourceOption
import com.razumly.mvp.core.network.ApiException
import com.razumly.mvp.core.data.repositories.EventEditorProposalStaleException
import com.razumly.mvp.core.network.dto.EventEditorErrorDto
import com.razumly.mvp.core.network.dto.EventEditorBootstrapQueryDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode
import com.razumly.mvp.core.data.repositories.RegistrationQuestionDraft
import com.razumly.mvp.eventDetail.PendingStaffInviteDraft
import com.razumly.mvp.eventDetail.EventStaffRole
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.toLocalDateTime
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import com.razumly.mvp.schedule.ScheduleProposalReviewPhase

class DefaultCreateEventComponentTest : MainDispatcherTest() {
    private fun confirmPartialProposal(harness: CreateEventHarness) {
        val requestsBeforeConfirmation = harness.eventRepository.acceptedPartialEventEditorProposals.size
        harness.component.acceptScheduleProposal()
        advance()
        assertEquals(ScheduleProposalReviewPhase.CONFIRMING_PARTIAL, harness.component.scheduleProposalState.value.phase)
        assertEquals(requestsBeforeConfirmation, harness.eventRepository.acceptedPartialEventEditorProposals.size)
        harness.component.acceptScheduleProposal()
        advance()
    }

    @Test
    fun given_reviewed_proposal_when_back_returns_to_setup_then_configuration_and_unchanged_request_identity_are_retained() = runTest(testDispatcher) {
        val harness = partialProposalHarness()
        advance()
        val setupStep = harness.component.childStack.value.active.configuration
        harness.component.nextStep()
        advance()
        assertEquals(CreateEventComponent.Config.Preview, harness.component.childStack.value.active.configuration)
        harness.component.createEvent()
        advance()
        val setup = harness.component.newEventState.value
        val fields = harness.component.localFields.value
        val slots = harness.component.leagueSlots.value
        val firstCommand = harness.eventRepository.attemptedCreateEventEditorCommands.single()

        harness.component.onBackClicked()
        advance()
        assertEquals(setupStep, harness.component.childStack.value.active.configuration)
        assertNull(harness.component.pendingScheduleProposal.value)
        assertEquals(setup, harness.component.newEventState.value)
        assertEquals(fields, harness.component.localFields.value)
        assertEquals(slots, harness.component.leagueSlots.value)
        assertEquals(0, harness.onEventCreatedCount)

        harness.component.createEvent()
        advance()
        val nextCommand = harness.eventRepository.attemptedCreateEventEditorCommands.last()
        assertEquals(firstCommand.draft, nextCommand.draft)
        assertEquals(firstCommand.createOperationId, nextCommand.createOperationId)
        harness.component.returnToScheduleSetup()
        harness.component.updateEventField { copy(name = "Corrected setup") }
        harness.component.createEvent()
        advance()
        assertNotEquals(firstCommand.createOperationId, harness.eventRepository.attemptedCreateEventEditorCommands.last().createOperationId)
    }

    @Test
    fun given_failed_schedule_creation_when_retry_selected_then_setup_and_request_identity_are_preserved() = runTest(testDispatcher) {
        val harness = partialProposalHarness()
        advance()
        val setup = harness.component.newEventState.value
        harness.eventRepository.createEditorFailure = IllegalStateException("No schedule response. Try again.")
        harness.component.createEvent()
        advance()

        val firstCommand = harness.eventRepository.attemptedCreateEventEditorCommands.single()
        val failure = harness.component.errorState.value
        assertEquals("Retry proposal", failure?.actionLabel)
        // Create adds the Event type tag before submission.
        val submittedSetup = harness.component.newEventState.value
        assertEquals(setup.copy(tags = submittedSetup.tags), submittedSetup)
        assertEquals(0, harness.onEventCreatedCount)
        harness.eventRepository.createEditorFailure = null
        failure?.action?.invoke()
        advance()

        assertEquals(firstCommand, harness.eventRepository.attemptedCreateEventEditorCommands.last())
        assertEquals(submittedSetup, harness.component.newEventState.value)
        assertTrue(harness.component.pendingScheduleProposal.value?.proposal != null)
        assertEquals(0, harness.onEventCreatedCount)
    }

    @Test
    fun given_failed_image_delete_when_retrying_then_selection_is_preserved() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.imageRepository.deleteFailure = IllegalStateException("offline")
        var deletedSelections = 0

        harness.component.deleteImage("event-image") { deletedSelections += 1 }
        advance()

        val failure = harness.component.errorState.value
        assertEquals(
            "We couldn't delete this event image. Check your connection and try again.",
            failure?.message,
        )
        assertEquals("Try again", failure?.actionLabel)
        assertEquals(0, deletedSelections)
        assertFalse(harness.loadingHandler.loadingState.value.isLoading)

        harness.imageRepository.deleteFailure = null
        failure?.action?.invoke()
        advance()

        assertEquals(1, deletedSelections)
        assertFalse(harness.loadingHandler.loadingState.value.isLoading)
    }

    @Test
    fun given_canonical_create_bootstrap_when_screen_loads_then_event_is_initialized() = runTest(testDispatcher) {
        val seededEvent = com.razumly.mvp.core.data.dataTypes.Event(
            id = "seeded-event",
            name = "Seeded League",
            hostId = "user-1",
            eventType = EventType.LEAGUE,
            isAutomatedScheduling = true,
            sportIds = listOf("Indoor Volleyball"),
            start = Instant.parse("2026-07-01T00:00:00Z"),
            end = Instant.parse("2026-07-01T02:00:00Z"),
            divisions = listOf("open"),
            fieldIds = listOf("field-1"),
            timeSlotIds = listOf("slot-1"),
        )
        val seededField = Field(
            id = "field-1",
            name = "Template Court",
            divisions = listOf("open"),
        )
        val seededSlot = TimeSlot(
            id = "slot-1",
            dayOfWeek = 3,
            startTimeMinutes = 0,
            endTimeMinutes = 120,
            startDate = Instant.parse("2026-07-01T00:00:00Z"),
            repeating = false,
            endDate = Instant.parse("2026-07-01T02:00:00Z"),
            scheduledFieldId = "field-1",
            scheduledFieldIds = listOf("field-1"),
            divisions = listOf("open"),
            price = null,
        )
        val seededScoring = LeagueScoringConfigDTO(
            pointsForWin = 3,
        )
        val harness = CreateEventHarness(
            bootstrapSession = createEventEditorSession(
                event = seededEvent,
                fields = listOf(seededField),
                timeSlots = listOf(seededSlot),
                leagueScoringConfig = seededScoring,
            ),
        )
        advance()

        assertEquals("Seeded League", harness.component.newEventState.value.name)
        assertEquals(EventType.LEAGUE, harness.component.currentEventType.value)
        assertEquals(listOf("field-1"), harness.component.localFields.value.map(Field::id))
        assertEquals(listOf("slot-1"), harness.component.leagueSlots.value.map(TimeSlot::id))
        assertTrue(harness.component.useManualTimeSlots.value)
        assertEquals(3, harness.component.leagueScoringConfig.value.pointsForWin)
    }

    @Test
    fun given_template_bootstrap_when_create_command_is_built_then_start_resources_questions_and_staff_are_preserved() = runTest(testDispatcher) {
        val templateQuery = EventEditorBootstrapQueryDto(
            organizationId = "org-1",
            templateId = "template-1",
            start = "2026-07-15T10:00:00Z",
        )
        val seededEvent = com.razumly.mvp.core.data.dataTypes.Event(
            id = "template-event",
            name = "Template League",
            hostId = "user-1",
            organizationId = "org-1",
            eventType = EventType.LEAGUE,
            isAutomatedScheduling = true,
            sportIds = listOf("Indoor Volleyball"),
            start = Instant.parse("2026-07-15T10:00:00Z"),
            end = Instant.parse("2026-07-15T12:00:00Z"),
            divisions = listOf("open"),
            fieldIds = listOf("template-field"),
            timeSlotIds = listOf("template-slot"),
        )
        val seededQuestion = RegistrationQuestionDraft(
            id = "question-1",
            prompt = "Preferred side?",
            answerType = "TEXT",
            required = true,
            sortOrder = 0,
        )
        val seededStaff = PendingStaffInviteDraft(
            firstName = "Taylor",
            lastName = "Official",
            email = "taylor@example.com",
            roles = setOf(EventStaffRole.OFFICIAL),
        )
        val harness = CreateEventHarness(
            bootstrap = templateQuery,
            bootstrapSession = createEventEditorSession(
                event = seededEvent,
                fields = listOf(
                    Field(
                        id = "template-field",
                        name = "Template Court",
                        divisions = listOf("open"),
                    ),
                ),
                timeSlots = listOf(
                    TimeSlot(
                        id = "template-slot",
                        dayOfWeek = 3,
                        startTimeMinutes = 600,
                        endTimeMinutes = 720,
                        startDate = seededEvent.start,
                        endDate = seededEvent.end,
                        scheduledFieldId = "template-field",
                        scheduledFieldIds = listOf("template-field"),
                        divisions = listOf("open"),
                        repeating = false,
                        price = null,
                    ),
                ),
                questions = listOf(seededQuestion),
                pendingStaffInvites = listOf(seededStaff),
            ),
        )

        advance()

        assertEquals(listOf(templateQuery), harness.eventRepository.createBootstrapQueries)
        assertEquals(seededEvent.start, harness.component.newEventState.value.start)
        assertEquals(listOf("template-field"), harness.component.localFields.value.map(Field::id))
        assertEquals(listOf("template-slot"), harness.component.leagueSlots.value.map(TimeSlot::id))
        assertEquals(listOf(seededQuestion), harness.component.registrationQuestionDrafts.value)
        assertEquals(listOf(seededStaff), harness.component.pendingStaffInvites.value)

        harness.component.createEvent()
        advance()

        val command = harness.eventRepository.createEventEditorCalls.single()
        assertEquals(seededEvent.start.toString(), command.draft.basics.start)
        assertEquals(listOf("template-field"), command.draft.resources.fieldIds)
        assertEquals(listOf("template-slot"), command.draft.resources.timeSlotIds)
        assertEquals("Preferred side?", command.draft.registration.questions.single().prompt)
        assertEquals("taylor@example.com", command.draft.staff.pendingInvites.single().email)
        assertEquals(1, harness.onEventCreatedCount)
    }

    @Test
    fun given_terms_loading_when_screen_loads_then_repository_state_is_mirrored() = runTest(testDispatcher) {
        val harness = CreateEventHarness()

        assertFalse(harness.component.termsConsentLoading.value)

        harness.userRepository.isChatTermsConsentLoading = true

        assertTrue(harness.component.termsConsentLoading.value)
    }

    @Test
    fun given_unaccepted_terms_when_screen_loads_then_shared_consent_state_is_used() = runTest(testDispatcher) {
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
    fun given_unaccepted_terms_when_terms_are_accepted_then_consent_state_is_updated() = runTest(testDispatcher) {
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
    fun given_staff_search_query_when_results_match_then_people_are_exposed_to_simple_setup() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.userRepository.searchResults = listOf(createUser(id = "staff-1"))

        harness.component.searchUsers("Test")
        advance()

        assertFalse(harness.component.userSearchLoading.value)
        assertEquals(listOf("staff-1"), harness.component.suggestedUsers.value.map { user -> user.id })

        harness.component.searchUsers("")

        assertFalse(harness.component.userSearchLoading.value)
        assertTrue(harness.component.suggestedUsers.value.isEmpty())
    }

    @Test
    fun given_host_and_assistant_updates_when_ids_overlap_then_host_duplication_is_prevented() = runTest(testDispatcher) {
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
    fun given_official_state_when_toggle_and_add_remove_operations_run_then_state_is_updated() = runTest(testDispatcher) {
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
    fun given_sport_templates_when_sport_is_selected_then_official_positions_are_seeded() = runTest(testDispatcher) {
        val sport = createSport(id = "sport-officials", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "R1", count = 1),
                SportOfficialPositionTemplate(name = "R2", count = 1),
            ),
        )
        val harness = CreateEventHarness(sports = listOf(sport))
        advance()

        harness.component.updateEventField { copy(sportIds = listOf(sport.id)) }
        advance()

        val updatedEvent = harness.component.newEventState.value
        assertEquals(listOf("R1", "R2"), updatedEvent.officialPositions.map { it.name })
        assertEquals(listOf(1, 1), updatedEvent.officialPositions.map { it.count })
    }

    @Test
    fun given_selected_sport_when_official_is_added_then_all_event_positions_are_assigned() = runTest(testDispatcher) {
        val sport = createSport(id = "sport-lines", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Referee", count = 1),
                SportOfficialPositionTemplate(name = "Line Judge", count = 2),
            ),
        )
        val harness = CreateEventHarness(sports = listOf(sport))
        advance()

        harness.component.updateEventField { copy(sportIds = listOf(sport.id)) }
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
    fun given_last_position_when_removed_then_defaults_are_not_restored_automatically() = runTest(testDispatcher) {
        val sport = createSport(id = "sport-clearable", usePointsPerSetWin = true).copy(
            officialPositionTemplates = listOf(
                SportOfficialPositionTemplate(name = "Referee", count = 1),
            ),
        )
        val harness = CreateEventHarness(sports = listOf(sport))
        advance()

        harness.component.updateEventField { copy(sportIds = listOf(sport.id)) }
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
    fun given_custom_official_positions_when_sports_switch_then_positions_are_preserved() = runTest(testDispatcher) {
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

        harness.component.updateEventField { copy(sportIds = listOf(originalSport.id)) }
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

        harness.component.updateEventField { copy(sportIds = listOf(nextSport.id)) }
        advance()

        assertEquals(
            listOf("Lead Official"),
            harness.component.newEventState.value.officialPositions.map { it.name },
        )
    }

    @Test
    fun given_duplicate_staff_roles_when_invites_merge_then_staging_is_rejected() = runTest(testDispatcher) {
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
    fun given_assigned_host_user_when_staff_invite_matches_then_email_is_rejected() = runTest(testDispatcher) {
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
    fun given_staff_invites_when_event_is_created_then_atomic_command_contains_staff() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField { copy(divisions = listOf("Open")) }
        advance()
        harness.component.updateAssistantHostIds(listOf("assistant-1"))
        harness.component.addOfficialId("official-1")
        advance()
        harness.component.createEvent()
        advance()

        val createPayload = harness.eventRepository.createEditorCalls.single().event
        assertEquals(listOf("assistant-1"), createPayload.assistantHostIds)
        assertEquals(listOf("official-1"), createPayload.officialIds)
        assertTrue(harness.eventRepository.createEventEditorCalls.single().draft.staff.pendingInvites.isEmpty())
        assertTrue(harness.userRepository.createInviteCalls.isEmpty())
    }

    @Test
    fun given_registration_questions_when_event_is_created_then_atomic_command_contains_questions() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()
        harness.component.updateEventField { copy(divisions = listOf("Open")) }
        harness.component.setRegistrationQuestionDrafts(
            listOf(
                RegistrationQuestionDraft(
                    prompt = "What position do you play?",
                    answerType = "LONG_TEXT",
                    required = true,
                ),
            ),
        )
        advance()

        harness.component.createEvent()
        advance()

        val question = harness.eventRepository.createEventEditorCalls
            .single()
            .draft
            .registration
            .questions
            .single()
        assertEquals("What position do you play?", question.prompt)
        assertEquals("LONG_TEXT", question.answerType)
        assertTrue(question.required)
        assertEquals(0, question.sortOrder)
        assertTrue(question.clientId?.isNotBlank() == true)
        assertEquals(null, question.id)
        assertEquals(1, harness.onEventCreatedCount)
    }

    @Test
    fun given_retried_create_when_question_is_reused_then_client_id_is_stable() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()
        harness.component.updateEventField { copy(divisions = listOf("Open")) }
        harness.component.setRegistrationQuestionDrafts(
            listOf(
                RegistrationQuestionDraft(
                    prompt = "What position do you play?",
                    answerType = "LONG_TEXT",
                    required = true,
                ),
            ),
        )
        advance()

        harness.eventRepository.createEditorFailure = IllegalStateException("Network response lost.")
        harness.component.createEvent()
        advance()
        assertEquals(1, harness.eventRepository.attemptedCreateEventEditorCommands.size)
        assertTrue(harness.eventRepository.createEventEditorCalls.isEmpty())
        assertTrue(harness.eventRepository.createEditorCalls.isEmpty())
        val firstCommand = harness.eventRepository.attemptedCreateEventEditorCommands.single()
        val firstQuestion = firstCommand.draft.registration.questions.single()
        assertTrue(firstQuestion.clientId?.isNotBlank() == true)

        harness.eventRepository.createEditorFailure = null
        harness.component.createEvent()
        advance()

        assertEquals(2, harness.eventRepository.attemptedCreateEventEditorCommands.size)
        val retryCommand = harness.eventRepository.attemptedCreateEventEditorCommands.last()
        assertEquals(firstCommand, retryCommand)
        assertEquals(firstQuestion.clientId, retryCommand.draft.registration.questions.single().clientId)
        assertEquals(1, harness.eventRepository.createEventEditorCalls.size)
        assertEquals(retryCommand, harness.eventRepository.createEventEditorCalls.single())
        assertEquals(1, harness.eventRepository.createEditorCalls.size)
        assertEquals(1, harness.onEventCreatedCount)
    }

    @Test
    fun given_scheduled_league_create_when_proposal_is_returned_then_acceptance_uses_the_exact_proposal() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness(
                bootstrapSession = createEventEditorSession(
                    event = com.razumly.mvp.core.data.dataTypes.Event(
                        id = "bootstrap-league",
                        name = "Scheduled League",
                        hostId = "user-1",
                        eventType = EventType.LEAGUE,
                        sportIds = listOf("Indoor Volleyball"),
                        start = Instant.parse("2026-07-01T00:00:00Z"),
                        end = Instant.parse("2026-07-01T02:00:00Z"),
                        divisions = listOf("Open"),
                        isAutomatedScheduling = true,
                    ),
                ),
            )
            harness.eventRepository.createEditorOutcomeFactory = { command, session ->
                com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome(
                    session = session,
                    staffEmailDelivery = "NOT_REQUESTED",
                    scheduleOutcome = createEventEditorScheduleOutcome(
                        eventId = session.canonicalState.event.id,
                    ),
                    proposal = createEventEditorScheduleProposal(command, session),
                )
            }
            advance()

            harness.component.createEvent()
            advance()

            val command = harness.eventRepository.createEventEditorCalls.single()
            assertTrue(command.hasScheduleProposalSupport)
            assertEquals(
                com.razumly.mvp.core.network.dto.EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE,
                command.completion.mode,
            )
            assertEquals(
                1,
                harness.component.pendingScheduleProposal.value
                    ?.proposal
                    ?.scheduleOutcome
                    ?.matchCount,
            )
            assertEquals(0, harness.onEventCreatedCount)

            harness.component.acceptScheduleProposal()
            advance()

            val accepted = harness.eventRepository.acceptedEventEditorProposals.single()
            assertEquals(command.createOperationId, accepted.createOperationId)
            assertEquals(command.draft, accepted.draft)
            assertEquals("proposal-revision", accepted.proposalRevision)
            assertEquals(1, harness.onEventCreatedCount)
            assertTrue(harness.component.pendingScheduleProposal.value == null)
        }

    @Test
    fun given_partial_schedule_proposal_when_created_then_only_partial_acceptance_persists_after_confirmation() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness(
                bootstrapSession = createEventEditorSession(
                    event = com.razumly.mvp.core.data.dataTypes.Event(
                        id = "bootstrap-partial",
                        name = "Partial League",
                        hostId = "user-1",
                        eventType = EventType.LEAGUE,
                        sportIds = listOf("Indoor Volleyball"),
                        start = Instant.parse("2026-07-01T00:00:00Z"),
                        end = Instant.parse("2026-07-01T02:00:00Z"),
                        divisions = listOf("Open"),
                        isAutomatedScheduling = true,
                    ),
                ),
            )
            harness.eventRepository.createEditorOutcomeFactory = { command, session ->
                com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome(
                    session = session,
                    staffEmailDelivery = "NOT_REQUESTED",
                    scheduleOutcome = createEventEditorPartialScheduleProposal(command, session)
                        .scheduleOutcome,
                    proposal = createEventEditorPartialScheduleProposal(command, session),
                )
            }
            advance()

            harness.component.createEvent()
            advance()

            assertEquals(0, harness.onEventCreatedCount)
            assertTrue(harness.eventRepository.acceptedEventEditorProposals.isEmpty())
            assertTrue(harness.eventRepository.acceptedPartialEventEditorProposals.isEmpty())
            val proposal = harness.component.pendingScheduleProposal.value?.proposal
            assertEquals(
                com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus.PARTIAL,
                proposal?.scheduleOutcome?.status,
            )
            assertEquals(listOf("match-unplaced"), proposal?.scheduleOutcome?.unscheduledMatches?.map { it.id })
            assertEquals(
                listOf("playoff-phase"),
                proposal?.scheduleOutcome?.affectedCompetitionPhases?.map { it.id },
            )

            harness.component.acceptScheduleProposal()
            advance()
            assertEquals(ScheduleProposalReviewPhase.CONFIRMING_PARTIAL, harness.component.scheduleProposalState.value.phase)
            assertTrue(harness.eventRepository.acceptedPartialEventEditorProposals.isEmpty())
            assertEquals(0, harness.onEventCreatedCount)
            harness.component.returnToScheduleSetup()
            assertEquals(ScheduleProposalReviewPhase.PROPOSED, harness.component.scheduleProposalState.value.phase)
            harness.component.acceptScheduleProposal()
            advance()
            harness.component.acceptScheduleProposal()
            advance()

            val command = harness.eventRepository.createEventEditorCalls.single()
            val accepted = harness.eventRepository.acceptedPartialEventEditorProposals.single()
            assertEquals(command.createOperationId, accepted.createOperationId)
            assertEquals("proposal-revision", accepted.proposalRevision)
            assertTrue(accepted.acceptanceOperationId.isNotBlank())
            assertEquals(1, harness.onEventCreatedCount)
            assertTrue(harness.eventRepository.acceptedEventEditorProposals.isEmpty())
            assertTrue(harness.component.pendingScheduleProposal.value == null)
        }

    @Test
    fun given_partial_acceptance_transport_failure_when_retried_then_acceptance_identity_is_reused() =
        runTest(testDispatcher) {
            val harness = partialProposalHarness()
            harness.eventRepository.acceptEditorFailure = IllegalStateException("transport timeout")
            advance()

            harness.component.createEvent()
            advance()
            confirmPartialProposal(harness)

            val firstAttempt = harness.eventRepository.acceptedPartialEventEditorProposals.single()
            assertTrue(harness.component.pendingScheduleProposal.value != null)
            assertEquals(0, harness.onEventCreatedCount)

            harness.eventRepository.acceptEditorFailure = null
            confirmPartialProposal(harness)

            val attempts = harness.eventRepository.acceptedPartialEventEditorProposals
            assertEquals(2, attempts.size)
            assertEquals(firstAttempt.acceptanceOperationId, attempts.last().acceptanceOperationId)
            assertEquals(1, harness.onEventCreatedCount)
            assertTrue(harness.component.pendingScheduleProposal.value == null)
        }

    @Test
    fun given_typed_stale_partial_acceptance_then_refresh_requires_a_new_proposal() =
        runTest(testDispatcher) {
            val harness = partialProposalHarness()
            harness.eventRepository.acceptEditorFailure = EventEditorProposalStaleException(
                statusCode = 409,
                url = "/api/events/editor/accept",
                payload = EventEditorErrorDto(
                    error = "Proposal is stale.",
                    code = "EDITOR_PROPOSAL_STALE",
                ),
                responseBody = null,
            )
            advance()

            harness.component.createEvent()
            advance()
            confirmPartialProposal(harness)

            val firstProposal = harness.component.pendingScheduleProposal.value
            assertTrue(firstProposal != null)
            assertEquals(ScheduleProposalReviewPhase.STALE, harness.component.scheduleProposalState.value.phase)
            assertTrue(harness.component.errorState.value?.message?.contains("stale") == true)
            assertEquals("Refresh proposal", harness.component.errorState.value?.actionLabel)
            assertEquals(1, harness.eventRepository.acceptedPartialEventEditorProposals.size)

            // A stale proposal remains available, but accepting it again must not retry
            // the old revision or perform another repository write.
            harness.component.acceptScheduleProposal()
            advance()
            assertEquals(1, harness.eventRepository.acceptedPartialEventEditorProposals.size)
            assertEquals(firstProposal, harness.component.pendingScheduleProposal.value)

            harness.eventRepository.acceptEditorFailure = null
            harness.component.refreshScheduleProposal()
            advance()

            assertEquals(2, harness.eventRepository.createEventEditorCalls.size)
            assertNotEquals(
                harness.eventRepository.createEventEditorCalls[0].createOperationId,
                harness.eventRepository.createEventEditorCalls[1].createOperationId,
            )
            assertEquals(ScheduleProposalReviewPhase.PROPOSED, harness.component.scheduleProposalState.value.phase)
            assertEquals(
                firstProposal?.proposal?.snapshot?.draft?.basics?.name,
                harness.component.pendingScheduleProposal.value?.proposal?.snapshot?.draft?.basics?.name,
            )

            confirmPartialProposal(harness)
            assertEquals(2, harness.eventRepository.acceptedPartialEventEditorProposals.size)
            assertEquals(1, harness.onEventCreatedCount)
            assertTrue(harness.component.pendingScheduleProposal.value == null)
            assertEquals(ScheduleProposalReviewPhase.NONE, harness.component.scheduleProposalState.value.phase)
        }

    @Test
    fun given_changed_create_setup_when_proposal_is_accepted_then_it_is_stale_and_rejection_creates_nothing() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness(
                bootstrapSession = createEventEditorSession(
                    event = com.razumly.mvp.core.data.dataTypes.Event(
                        id = "bootstrap-league",
                        name = "Scheduled League",
                        hostId = "user-1",
                        eventType = EventType.LEAGUE,
                        sportIds = listOf("Indoor Volleyball"),
                        start = Instant.parse("2026-07-01T00:00:00Z"),
                        end = Instant.parse("2026-07-01T02:00:00Z"),
                        divisions = listOf("Open"),
                        isAutomatedScheduling = true,
                    ),
                ),
            )
            harness.eventRepository.createEditorOutcomeFactory = { command, session ->
                com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome(
                    session = session,
                    staffEmailDelivery = "NOT_REQUESTED",
                    scheduleOutcome = createEventEditorScheduleOutcome(
                        eventId = session.canonicalState.event.id,
                    ),
                    proposal = createEventEditorScheduleProposal(command, session),
                )
            }
            advance()

            harness.component.createEvent()
            advance()
            assertEquals(0, harness.onEventCreatedCount)

            harness.component.updateEventField { copy(name = "Changed after proposal") }
            advance()
            harness.component.acceptScheduleProposal()
            advance()

            assertTrue(harness.eventRepository.acceptedEventEditorProposals.isEmpty())
            assertTrue(harness.component.errorState.value?.message?.contains("stale") == true)
            assertEquals(ScheduleProposalReviewPhase.STALE, harness.component.scheduleProposalState.value.phase)
            assertEquals("Changed after proposal", harness.component.newEventState.value.name)
            assertEquals(0, harness.onEventCreatedCount)

            harness.component.rejectScheduleProposal()
            advance()

            assertEquals(1, harness.eventRepository.rejectedEventEditorProposals.size)
            assertTrue(harness.component.pendingScheduleProposal.value == null)
            assertEquals(0, harness.onEventCreatedCount)
        }

    @Test
    fun given_invalid_pending_staff_when_event_is_created_then_post_is_rejected() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()
        harness.component.updateEventField { copy(divisions = listOf("Open")) }
        advance()
        harness.component.addPendingStaffInvite(
            firstName = "Invalid",
            lastName = "Staff",
            email = "not-an-email",
            roles = setOf(EventStaffRole.OFFICIAL),
        ).getOrThrow()

        harness.component.createEvent()
        advance()

        assertTrue(harness.eventRepository.createEditorCalls.isEmpty())
        assertEquals(0, harness.onEventCreatedCount)
        assertTrue(
            harness.component.errorState.value?.message
                ?.contains("valid staff invite email", ignoreCase = true) == true,
        )
    }

    @Test
    fun given_repository_failure_when_event_create_finishes_then_loading_overlay_closes() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.eventRepository.createEditorFailure = IllegalStateException(
            "Add more slot availability, extend slot windows, or reduce teams.",
        )
        advance()
        harness.component.updateEventField { copy(divisions = listOf("Open")) }
        advance()

        harness.component.createEvent()
        advance()

        assertFalse(harness.loadingHandler.loadingState.value.isLoading)
        assertEquals(
            "Add more slot availability, extend slot windows, or reduce teams.",
            harness.component.errorState.value?.message,
        )
        assertEquals(0, harness.onEventCreatedCount)
    }
    @Test
    fun given_editor_api_failure_when_event_create_fails_then_message_is_reported() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.eventRepository.createEditorFailure = ApiException(
            statusCode = 500,
            url = "http://10.0.2.2:3000/api/events/editor",
            responseBody = """{"error":"Unable to save event editor configuration. Database write failed. Reference: request-1.","code":"EDITOR_SAVE_FAILED","details":"Database write failed.","requestId":"request-1"}""",
        )
        advance()
        harness.component.updateEventField { copy(divisions = listOf("Open")) }
        advance()

        harness.component.createEvent()
        advance()

        assertFalse(harness.loadingHandler.loadingState.value.isLoading)
        assertEquals(
            "Unable to save event editor configuration. Database write failed. Reference: request-1.",
            harness.component.errorState.value?.message,
        )
        assertEquals(0, harness.onEventCreatedCount)
    }

    @Test
    fun given_staff_delivery_failure_when_event_create_succeeds_then_warning_is_reported() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()
        harness.component.updateEventField { copy(divisions = listOf("Open")) }
        advance()
        harness.component.updateAssistantHostIds(listOf("assistant-1"))
        harness.component.addPendingStaffInvite(
            firstName = "Taylor",
            lastName = "Staff",
            email = "taylor@example.com",
            roles = setOf(EventStaffRole.OFFICIAL),
        ).getOrThrow()
        harness.eventRepository.staffEmailDelivery = "FAILED"

        harness.component.createEvent()
        advance()

        val createPayload = harness.eventRepository.createEditorCalls.single().event
        assertEquals(listOf("assistant-1"), createPayload.assistantHostIds)
        assertEquals(emptyList(), createPayload.eventOfficials)
        assertEquals(1, harness.onEventCreatedCount)
        assertEquals(listOf("taylor@example.com"), harness.component.pendingStaffInvites.value.map { it.email })
        assertEquals(
            "Event created, but staff invite delivery needs attention.",
            harness.component.errorState.value?.message,
        )
    }

    @Test
    fun given_team_officials_disabled_when_state_updates_then_swap_permission_is_cleared() = runTest(testDispatcher) {
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
    fun given_team_officials_disabled_when_state_updates_then_staffing_priority_is_preserved() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField {
            copy(
                doTeamsOfficiate = true,
                staffingPriority = StaffingPriority.TEAM_COVERAGE_REQUIRED,
            )
        }
        advance()

        harness.component.updateDoTeamsOfficiate(false)
        advance()

        val updatedEvent = harness.component.newEventState.value
        assertEquals(false, updatedEvent.doTeamsOfficiate)
        assertEquals(StaffingPriority.TEAM_COVERAGE_REQUIRED, updatedEvent.staffingPriority)
    }

    @Test
    fun given_payment_plan_mutations_when_state_changes_then_installments_stay_in_sync() = runTest(testDispatcher) {
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
    fun given_different_scoring_modes_when_sports_switch_then_league_config_resets() = runTest(testDispatcher) {
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

        harness.component.updateEventField { copy(sportIds = listOf(timedSport.id)) }
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

        harness.component.updateEventField { copy(sportIds = listOf(setBasedSport.id)) }
        advance()

        assertEquals(LeagueScoringConfigDTO(), harness.component.leagueScoringConfig.value)
    }

    @Test
    fun given_seeded_set_duration_when_cleared_then_sport_default_is_not_restored() = runTest(testDispatcher) {
        val setBasedSport = createSport(
            id = "sport-clear-duration",
            usePointsPerSetWin = true,
        )
        val harness = CreateEventHarness(sports = listOf(setBasedSport))
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        harness.component.updateEventField { copy(sportIds = listOf(setBasedSport.id)) }
        advance()
        assertEquals(20, harness.component.newEventState.value.setDurationMinutes)

        harness.component.updateEventField { copy(setDurationMinutes = null) }
        advance()

        assertNull(harness.component.newEventState.value.setDurationMinutes)
    }

    @Test
    fun given_result_points_sport_when_selected_then_standings_defaults_are_applied() = runTest(testDispatcher) {
        val soccer = createSport(
            id = "Indoor Soccer",
            usePointsPerSetWin = false,
        ).copy(
            usePointsForWin = true,
            usePointsForDraw = true,
            usePointsForLoss = true,
        )
        val harness = CreateEventHarness(sports = listOf(soccer))
        advance()

        harness.component.updateEventField { copy(sportIds = listOf(soccer.id)) }
        advance()

        assertEquals(3, harness.component.leagueScoringConfig.value.pointsForWin)
        assertEquals(1, harness.component.leagueScoringConfig.value.pointsForDraw)
        assertEquals(0, harness.component.leagueScoringConfig.value.pointsForLoss)
    }

    @Test
    fun given_preselected_result_points_sport_when_league_is_entered_then_standings_defaults_are_initialized_once() =
        runTest(testDispatcher) {
            val soccer = createSport(
                id = "Indoor Soccer",
                usePointsPerSetWin = false,
            ).copy(
                usePointsForWin = true,
                usePointsForDraw = true,
                usePointsForLoss = true,
            )
            val harness = CreateEventHarness(
                sports = listOf(soccer),
                bootstrapSession = createEventEditorSession(
                    event = com.razumly.mvp.core.data.dataTypes.Event(
                        eventType = EventType.EVENT,
                        sportIds = listOf(soccer.id),
                    ),
                ),
            )
            advance()

            assertEquals(LeagueScoringConfigDTO(), harness.component.leagueScoringConfig.value)

            harness.component.onTypeSelected(EventType.LEAGUE)
            advance()

            assertEquals(3, harness.component.leagueScoringConfig.value.pointsForWin)
            assertEquals(1, harness.component.leagueScoringConfig.value.pointsForDraw)
            assertEquals(0, harness.component.leagueScoringConfig.value.pointsForLoss)

            harness.component.updateLeagueScoringConfig { copy(pointsForWin = null) }
            harness.component.updateEventField { copy(name = "Keep cleared value") }
            advance()

            assertNull(harness.component.leagueScoringConfig.value.pointsForWin)
        }

    @Test
    fun given_event_fields_when_sport_is_unchanged_then_league_scoring_config_is_preserved() = runTest(testDispatcher) {
        val timedSport = createSport(
            id = "sport-timed",
            usePointsPerSetWin = false,
        )
        val harness = CreateEventHarness(sports = listOf(timedSport))
        advance()

        harness.component.updateEventField { copy(sportIds = listOf(timedSport.id)) }
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
                sportIds = listOf(timedSport.id),
                name = "League Config Should Stay",
            )
        }
        advance()

        assertEquals(configured, harness.component.leagueScoringConfig.value)
    }

    @Test
    fun given_competition_type_when_selected_then_finite_end_and_scheduling_defaults_are_used() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        assertFalse(harness.component.newEventState.value.noFixedEndDateTime)
        assertTrue(harness.component.newEventState.value.isAutomatedScheduling)
        assertFalse(harness.component.useManualTimeSlots.value)

        harness.component.updateEventField { copy(isAutomatedScheduling = false) }
        advance()
        harness.component.onTypeSelected(EventType.TOURNAMENT)
        advance()
        assertTrue(harness.component.newEventState.value.noFixedEndDateTime)
        assertTrue(harness.component.newEventState.value.isAutomatedScheduling)
        assertFalse(harness.component.useManualTimeSlots.value)

        harness.component.onTypeSelected(EventType.EVENT)
        advance()
        assertFalse(harness.component.newEventState.value.noFixedEndDateTime)
        assertFalse(harness.component.newEventState.value.isAutomatedScheduling)

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        assertTrue(harness.component.newEventState.value.isAutomatedScheduling)

        harness.component.onTypeSelected(EventType.WEEKLY_EVENT)
        advance()
        assertTrue(harness.component.newEventState.value.isAutomatedScheduling)
        assertTrue(harness.component.useManualTimeSlots.value)

        harness.component.onTypeSelected(EventType.TRYOUT)
        advance()
        assertFalse(harness.component.newEventState.value.isAutomatedScheduling)
        assertTrue(harness.component.useManualTimeSlots.value)

        harness.component.onTypeSelected(EventType.EVENT)
        advance()
        assertFalse(harness.component.newEventState.value.noFixedEndDateTime)
        assertFalse(harness.component.newEventState.value.isAutomatedScheduling)
        assertFalse(harness.component.useManualTimeSlots.value)
    }

    @Test
    fun given_tournament_when_league_and_tournament_are_selected_back_to_back_then_latest_selection_is_applied() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness(
                bootstrapSession = createEventEditorSession(
                    event = com.razumly.mvp.core.data.dataTypes.Event(
                        eventType = EventType.TOURNAMENT,
                    ),
                ),
            )
            advance()

            harness.component.onTypeSelected(EventType.LEAGUE)
            harness.component.onTypeSelected(EventType.TOURNAMENT)

            assertEquals(EventType.TOURNAMENT, harness.component.currentEventType.value)

            advance()

            assertEquals(EventType.TOURNAMENT, harness.component.newEventState.value.eventType)
        }

    @Test
    fun given_automated_league_with_slots_when_tryout_is_selected_then_manual_slot_state_is_preserved() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness()
            advance()

            harness.component.onTypeSelected(EventType.LEAGUE)
            advance()
            harness.component.setUseManualTimeSlots(true)
            advance()
            assertTrue(harness.component.leagueSlots.value.isNotEmpty())

            harness.component.onTypeSelected(EventType.TRYOUT)
            advance()

            assertEquals(EventType.TRYOUT, harness.component.newEventState.value.eventType)
            assertTrue(harness.component.useManualTimeSlots.value)
            assertTrue(harness.component.leagueSlots.value.isNotEmpty())
        }

    @Test
    fun given_explicit_capacity_when_tournament_is_selected_then_invalid_inputs_are_preserved_for_validation() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField { copy(maxParticipants = 2) }
        advance()
        harness.component.onTypeSelected(EventType.TOURNAMENT)
        advance()

        assertEquals(2, harness.component.newEventState.value.maxParticipants)

        harness.component.updateEventField { copy(maxParticipants = 1) }
        advance()

        assertEquals(1, harness.component.newEventState.value.maxParticipants)
    }

    @Test
    fun given_team_signup_choice_when_weekly_event_is_selected_then_choice_is_preserved() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.updateEventField { copy(teamSignup = false) }
        advance()

        harness.component.onTypeSelected(EventType.WEEKLY_EVENT)
        advance()

        assertEquals(EventType.WEEKLY_EVENT, harness.component.newEventState.value.eventType)
        assertFalse(harness.component.newEventState.value.teamSignup)
        assertFalse(harness.component.newEventState.value.noFixedEndDateTime)
        assertFalse(harness.component.newEventState.value.singleDivision)
    }

    @Test
    fun given_weekly_event_when_created_then_resource_count_and_repeating_slot_are_persisted() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.WEEKLY_EVENT)
        advance()
        harness.component.selectFieldCount(2)
        advance()
        val localFieldIds = harness.component.localFields.value.map { field -> field.id }
        harness.component.updateEventField {
            copy(
                name = "Weekly Training",
                organizationId = "org-weekly",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_604_800_000),
                noFixedEndDateTime = true,
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                repeating = true,
                dayOfWeek = 1,
                daysOfWeek = listOf(1, 3),
                startTimeMinutes = 18 * 60,
                endTimeMinutes = 20 * 60,
                scheduledFieldId = localFieldIds.first(),
                scheduledFieldIds = localFieldIds,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        val createCall = harness.eventRepository.createEditorCalls.single()
        assertEquals(2, createCall.fields.orEmpty().size)
        assertEquals(createCall.fields.orEmpty().map { field -> field.id }, createCall.event.fieldIds)
        assertTrue(createCall.event.noFixedEndDateTime)
        assertEquals(1, createCall.timeSlots.orEmpty().size)
        assertTrue(createCall.timeSlots.orEmpty().single().repeating)
        assertEquals(listOf(1, 3), createCall.timeSlots.orEmpty().single().daysOfWeek)
        assertEquals(
            createCall.timeSlots.orEmpty().map { slot -> slot.id },
            createCall.event.timeSlotIds,
        )
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
        assertEquals(1, harness.eventRepository.createEditorCalls.size)
        val createCall = harness.eventRepository.createEditorCalls.single()
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
    fun given_completed_rental_booking_when_create_opens_then_exact_canonical_items_are_preselected_and_locked() =
        runTest(testDispatcher) {
            val firstItem = RentalResourceOption(
                id = "booking-completed:item-1",
                bookingId = "booking-completed",
                bookingItemId = "item-1",
                organizationId = "owner-org",
                organizationName = "Summit Sports",
                field = Field(
                    fieldNumber = 1,
                    organizationId = "owner-org",
                    id = "field-1",
                    name = "Court 1",
                ),
                start = instant(1_700_000_000_000),
                end = instant(1_700_003_600_000),
                timeZone = "UTC",
                priceCents = 2_500,
                requiredTemplateIds = listOf("participant-template"),
            )
            val secondItem = RentalResourceOption(
                id = "booking-completed:item-2",
                bookingId = "booking-completed",
                bookingItemId = "item-2",
                organizationId = "owner-org",
                organizationName = "Summit Sports",
                field = Field(
                    fieldNumber = 2,
                    organizationId = "owner-org",
                    id = "field-2",
                    name = "Court 2",
                ),
                start = instant(1_700_086_400_000),
                end = instant(1_700_090_000_000),
                timeZone = "UTC",
                priceCents = 3_000,
                hostRequiredTemplateIds = listOf("host-template"),
            )
            val unrelatedItem = RentalResourceOption(
                id = "booking-other:item-3",
                bookingId = "booking-other",
                bookingItemId = "item-3",
                organizationId = "other-org",
                field = Field(
                    fieldNumber = 1,
                    organizationId = "other-org",
                    id = "field-3",
                    name = "Other court",
                ),
                start = instant(1_700_172_800_000),
                end = instant(1_700_176_400_000),
                timeZone = "UTC",
                priceCents = 4_000,
            )
            val harness = CreateEventHarness(
                rentalResourceOptions = listOf(firstItem, unrelatedItem, secondItem),
                bootstrap = EventEditorBootstrapQueryDto(rentalBookingId = " booking-completed "),
                canonicalRentalOptions = listOf(firstItem, secondItem),
            )
            advance()

            assertEquals(
                listOf(EventEditorBootstrapQueryDto(rentalBookingId = " booking-completed ")),
                harness.eventRepository.createBootstrapQueries,
            )

            assertTrue(harness.component.isRentalResourceSelectionLocked)
            assertEquals(
                listOf(firstItem.id, secondItem.id),
                harness.component.availableRentalResources.value.map(RentalResourceOption::id),
            )
            assertEquals(
                setOf(firstItem.id, secondItem.id),
                harness.component.selectedRentalResourceIds.value,
            )
            assertEquals(
                setOf("item-1", "item-2"),
                harness.component.leagueSlots.value.mapNotNull(TimeSlot::rentalBookingItemId).toSet(),
            )

            harness.component.setRentalResourceSelected(firstItem.id, selected = false)
            harness.component.setRentalResourceSelected(unrelatedItem.id, selected = true)
            advance()

            assertEquals(
                setOf(firstItem.id, secondItem.id),
                harness.component.selectedRentalResourceIds.value,
            )

            harness.component.createEvent()
            advance()

            val createCall = harness.eventRepository.createEditorCalls.single()
            assertEquals(
                setOf("booking-completed"),
                createCall.timeSlots.orEmpty().mapNotNull(TimeSlot::rentalBookingId).toSet(),
            )
            assertEquals(
                setOf("item-1", "item-2"),
                createCall.timeSlots.orEmpty().mapNotNull(TimeSlot::rentalBookingItemId).toSet(),
            )
            assertTrue(createCall.timeSlots.orEmpty().all { slot -> slot.rentalLocked == true })
            val createdSlotsByItemId = createCall.timeSlots.orEmpty().associateBy(TimeSlot::rentalBookingItemId)
            assertEquals(listOf("field-1"), createdSlotsByItemId["item-1"]?.scheduledFieldIds)
            assertEquals(firstItem.start, createdSlotsByItemId["item-1"]?.startDate)
            assertEquals(firstItem.end, createdSlotsByItemId["item-1"]?.endDate)
            assertEquals(
                firstItem.requiredTemplateIds,
                createdSlotsByItemId["item-1"]?.requiredTemplateIds,
            )
            assertEquals(
                secondItem.hostRequiredTemplateIds,
                createdSlotsByItemId["item-2"]?.hostRequiredTemplateIds,
            )
        }

    @Test
    fun given_completed_rental_booking_when_canonical_items_are_missing_then_create_fails_closed() =
        runTest(testDispatcher) {
            val unrelatedItem = RentalResourceOption(
                id = "booking-other:item-1",
                bookingId = "booking-other",
                bookingItemId = "item-1",
                organizationId = "owner-org",
                field = Field(
                    fieldNumber = 1,
                    organizationId = "owner-org",
                    id = "field-1",
                    name = "Court 1",
                ),
                start = instant(1_700_000_000_000),
                end = instant(1_700_003_600_000),
                timeZone = "UTC",
                priceCents = 2_500,
            )
            val harness = CreateEventHarness(
                rentalResourceOptions = listOf(unrelatedItem),
                bootstrap = EventEditorBootstrapQueryDto(rentalBookingId = "booking-completed"),
                canonicalRentalOptions = listOf(unrelatedItem.copy(bookingId = "booking-completed")),
            )
            advance()

            assertEquals(emptyList(), harness.component.availableRentalResources.value)
            assertEquals(emptySet(), harness.component.selectedRentalResourceIds.value)

            harness.component.createEvent()
            advance()

            assertEquals(0, harness.eventRepository.createEditorCalls.size)
            assertEquals(
                "We couldn't verify every resource in this reservation. Return to the organization and try again.",
                harness.component.errorState.value?.message,
            )
        }

    @Test
    fun given_completed_rental_booking_when_one_of_two_items_is_omitted_then_create_fails_closed() =
        runTest(testDispatcher) {
            val firstItem = completedRentalOption(
                itemId = "item-1",
                fieldId = "field-1",
                start = instant(1_700_000_000_000),
                end = instant(1_700_003_600_000),
            )
            val secondItem = completedRentalOption(
                itemId = "item-2",
                fieldId = "field-2",
                start = instant(1_700_086_400_000),
                end = instant(1_700_090_000_000),
            )
            val harness = CreateEventHarness(
                rentalResourceOptions = listOf(firstItem),
                bootstrap = EventEditorBootstrapQueryDto(rentalBookingId = "booking-completed"),
                canonicalRentalOptions = listOf(firstItem, secondItem),
            )
            advance()

            assertEquals(emptyList(), harness.component.availableRentalResources.value)
            harness.component.createEvent()
            advance()

            assertTrue(harness.eventRepository.createEditorCalls.isEmpty())
            assertEquals(
                "We couldn't verify every resource in this reservation. Return to the organization and try again.",
                harness.component.errorState.value?.message,
            )
        }

    @Test
    fun given_completed_rental_booking_when_canonical_field_or_time_changes_then_create_fails_closed() =
        runTest(testDispatcher) {
            val expected = completedRentalOption(
                itemId = "item-1",
                fieldId = "field-1",
                start = instant(1_700_000_000_000),
                end = instant(1_700_003_600_000),
            )
            val changedField = expected.copy(
                field = expected.field.copy(id = "field-replaced"),
            )
            val changedTime = expected.copy(
                start = instant(1_700_000_060_000),
            )

            listOf(changedField, changedTime).forEach { changedOption ->
                val harness = CreateEventHarness(
                    rentalResourceOptions = listOf(changedOption),
                    bootstrap = EventEditorBootstrapQueryDto(rentalBookingId = "booking-completed"),
                    canonicalRentalOptions = listOf(expected),
                )
                advance()

                assertEquals(emptyList(), harness.component.availableRentalResources.value)
                harness.component.createEvent()
                advance()
                assertTrue(harness.eventRepository.createEditorCalls.isEmpty())
            }
        }

    @Test
    fun given_completed_rental_booking_when_expected_item_ids_are_duplicated_then_create_fails_closed() =
        runTest(testDispatcher) {
            val item = completedRentalOption(
                itemId = "item-1",
                fieldId = "field-1",
                start = instant(1_700_000_000_000),
                end = instant(1_700_003_600_000),
            )
            val harness = CreateEventHarness(
                rentalResourceOptions = listOf(item),
                bootstrap = EventEditorBootstrapQueryDto(rentalBookingId = "booking-completed"),
                canonicalRentalOptions = listOf(item, item),
            )
            advance()

            assertEquals(emptyList(), harness.component.availableRentalResources.value)
            harness.component.createEvent()
            advance()
            assertTrue(harness.eventRepository.createEditorCalls.isEmpty())
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

        val createCall = harness.eventRepository.createEditorCalls.single()
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
                end = instant(1_700_176_400_000),
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

        val createCall = harness.eventRepository.createEditorCalls.single()
        val customPayloadSlots = createCall.timeSlots.orEmpty()
            .filterNot { slot -> slot.rentalBookingItemId == "booking-item-1" }
        assertTrue(customPayloadSlots.isNotEmpty())
        assertTrue(customPayloadSlots.none { slot -> slot.scheduledFieldIds.orEmpty().contains("field-rental-main") })
    }

    @Test
    fun given_automatic_league_slot_when_field_count_reduced_then_remaining_field_is_retained() = runTest(testDispatcher) {
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
        assertEquals(fieldIds.first(), harness.component.leagueSlots.value.first().scheduledFieldId)
        assertEquals(listOf(fieldIds.first()), harness.component.leagueSlots.value.first().scheduledFieldIds)
    }

    @Test
    fun given_league_creation_with_overnight_configured_slot_when_submitted_then_creation_succeeds() = runTest(testDispatcher) {
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

        assertEquals(1, harness.eventRepository.createEditorCalls.size)
        assertEquals(1, harness.onEventCreatedCount)
        val payloadSlots = harness.eventRepository.createEditorCalls.single().timeSlots.orEmpty()
        assertTrue(
            payloadSlots.any { slot ->
                slot.startTimeMinutes == 700 && slot.endTimeMinutes == 650
            },
        )
    }

    @Test
    fun given_repeating_league_slot_without_end_time_when_submitted_then_creation_is_blocked() = runTest(testDispatcher) {
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

        assertEquals(0, harness.eventRepository.createEditorCalls.size)
        assertEquals(
            "Schedule slot 1 needs a start and end time.",
            harness.component.errorState.value?.message,
        )
    }

    @Test
    fun given_configured_league_slot_without_a_resource_when_submitted_then_creation_is_blocked() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        harness.component.selectFieldCount(1)
        harness.component.setUseManualTimeSlots(true)
        advance()

        harness.component.updateLeagueTimeSlot(0) {
            copy(
                repeating = true,
                dayOfWeek = 1,
                daysOfWeek = listOf(1),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = null,
                scheduledFieldIds = emptyList(),
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(0, harness.eventRepository.createEditorCalls.size)
        assertEquals(
            "Schedule slot 1 needs at least one resource.",
            harness.component.errorState.value?.message,
        )
    }

    @Test
    fun given_one_time_league_slot_without_an_end_time_when_submitted_then_creation_is_blocked() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        harness.component.selectFieldCount(1)
        harness.component.setUseManualTimeSlots(true)
        advance()
        val localFieldId = harness.component.localFields.value.first().id

        harness.component.updateLeagueTimeSlot(0) {
            copy(
                repeating = false,
                startDate = instant(1_700_000_000_000),
                endDate = null,
                endTimeMinutes = null,
                scheduledFieldId = localFieldId,
                scheduledFieldIds = listOf(localFieldId),
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(0, harness.eventRepository.createEditorCalls.size)
        assertTrue(
            harness.component.errorState.value?.message.orEmpty().contains("select an end time"),
        )
    }

    @Test
    fun given_repeating_slot_in_dst_gap_when_submitted_then_no_event_editor_write_occurs() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        harness.component.setLoadingHandler(harness.loadingHandler)
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        harness.component.selectFieldCount(1)
        harness.component.setUseManualTimeSlots(true)
        advance()
        val localFieldId = harness.component.localFields.value.first().id

        harness.component.updateEventField {
            copy(
                divisions = listOf("Open"),
                start = Instant.parse("2026-03-01T00:00:00Z"),
                end = Instant.parse("2026-03-15T00:00:00Z"),
                noFixedEndDateTime = false,
                timeZone = "America/New_York",
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 6,
                daysOfWeek = listOf(6),
                startTimeMinutes = 2 * 60 + 30,
                endTimeMinutes = 4 * 60,
                startDate = Instant.parse("2026-03-08T05:00:00Z"),
                endDate = Instant.parse("2026-03-09T04:00:00Z"),
                timeZone = "America/New_York",
                scheduledFieldId = localFieldId,
                scheduledFieldIds = listOf(localFieldId),
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertTrue(harness.eventRepository.attemptedCreateEventEditorCommands.isEmpty())
        assertTrue(harness.eventRepository.createEventEditorCalls.isEmpty())
        assertTrue(harness.eventRepository.createEditorCalls.isEmpty())

        assertTrue(
            harness.component.errorState.value?.message.orEmpty().contains("2026-03-08"),
        )
        assertTrue(
            harness.component.errorState.value?.message.orEmpty().contains("does not exist"),
        )
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
    fun given_league_schedule_when_automated_scheduling_is_disabled_then_hidden_schedule_state_is_cleared() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        harness.component.setUseManualTimeSlots(true)
        advance()

        assertTrue(harness.component.leagueSlots.value.isNotEmpty())
        harness.component.updateEventField {
            copy(
                isAutomatedScheduling = false,
                noFixedEndDateTime = true,
            )
        }
        advance()

        assertEquals(false, harness.component.newEventState.value.isAutomatedScheduling)
        assertEquals(false, harness.component.newEventState.value.noFixedEndDateTime)
        assertTrue(harness.component.leagueSlots.value.isEmpty())
        assertTrue(harness.component.newEventState.value.timeSlotIds.isEmpty())
        assertFalse(harness.component.useManualTimeSlots.value)
    }

    @Test
    fun given_unscheduled_league_bootstrap_with_hidden_slots_when_loaded_then_only_rental_slots_remain() =
        runTest(testDispatcher) {
            val eventStart = instant(1_700_000_000_000)
            val eventEnd = instant(1_700_003_600_000)
            val manualSlot = TimeSlot(
                id = "manual-slot",
                dayOfWeek = 1,
                startTimeMinutes = 540,
                endTimeMinutes = 600,
                startDate = eventStart,
                endDate = eventEnd,
                scheduledFieldId = "field-1",
                scheduledFieldIds = listOf("field-1"),
                divisions = listOf("open"),
                repeating = true,
                price = null,
            )
            val rentalSlot = manualSlot.copy(
                id = "rental-slot",
                sourceType = "RENTAL_BOOKING",
                rentalBookingId = "booking-1",
                rentalBookingItemId = "booking-item-1",
                rentalLocked = true,
            )
            val event = com.razumly.mvp.core.data.dataTypes.Event(
                id = "unscheduled-bootstrap",
                eventType = EventType.LEAGUE,
                isAutomatedScheduling = false,
                noFixedEndDateTime = false,
                start = eventStart,
                end = eventEnd,
                divisions = listOf("open"),
                fieldIds = listOf("field-1"),
                timeSlotIds = listOf(manualSlot.id, rentalSlot.id),
            )
            val harness = CreateEventHarness(
                bootstrapSession = createEventEditorSession(
                    event = event,
                    fields = listOf(Field(id = "field-1", name = "Court 1")),
                    timeSlots = listOf(manualSlot, rentalSlot),
                ),
            )

            advance()

            assertEquals(
                listOf(rentalSlot.id),
                harness.component.leagueSlots.value.map(TimeSlot::id),
            )
            assertFalse(harness.component.useManualTimeSlots.value)
            assertEquals(
                listOf(rentalSlot.id),
                harness.component.newEventState.value.timeSlotIds,
            )
        }

    @Test
    fun given_unscheduled_fixed_end_league_when_submitted_then_no_schedule_construction_values_are_persisted() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness()
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            harness.component.onTypeSelected(EventType.LEAGUE)
            advance()
            harness.component.selectFieldCount(1)
            advance()

            val eventStart = instant(1_700_000_000_000)
            val eventEnd = instant(1_700_003_600_000)
            harness.component.updateEventField {
                copy(
                    name = "Unscheduled League",
                    organizationId = "org-unscheduled-league",
                    divisions = listOf("Open"),
                    start = eventStart,
                    end = eventEnd,
                    isAutomatedScheduling = false,
                    noFixedEndDateTime = false,
                )
            }
            advance()

            harness.component.createEvent()
            advance()

            val command = harness.eventRepository.createEventEditorCalls.single()
            val createCall = harness.eventRepository.createEditorCalls.single()
            assertEquals(
                EventEditorCreateCompletionMode.CREATE_ONLY,
                command.completion.mode,
            )
            assertFalse(command.draft.schedule.isAutomatedScheduling)
            assertEquals(emptyList(), command.draft.resources.timeSlotIds)
            assertTrue(command.draft.resources.timeSlots.isEmpty())
            assertEquals(emptyList(), createCall.event.timeSlotIds)
            assertTrue(createCall.timeSlots.orEmpty().isEmpty())
            assertEquals(eventEnd, createCall.event.end)
            assertFalse(createCall.event.noFixedEndDateTime)
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

        val createCall = harness.eventRepository.createEditorCalls.single()
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

        val createdSlots = harness.eventRepository.createEditorCalls.single().timeSlots.orEmpty()
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
    fun given_failed_league_create_when_retrying_then_current_slot_state_is_preserved() = runTest(testDispatcher) {
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

        val initialSlotStart = instant(1_700_172_800_000)
        harness.component.updateEventField {
            copy(
                name = "League Retry Slot",
                organizationId = "org-retry-slot",
                divisions = listOf("Open"),
                start = instant(1_700_000_000_000),
                end = instant(1_700_259_200_000),
                noFixedEndDateTime = false,
            )
        }
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                repeating = true,
                startDate = initialSlotStart,
                dayOfWeek = 1,
                daysOfWeek = listOf(1, 3),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = localFieldId,
                scheduledFieldIds = listOf(localFieldId),
            )
        }
        advance()

        val slotBeforeFailure = harness.component.leagueSlots.value.single()
        harness.eventRepository.createEditorFailure = IllegalStateException("offline")
        harness.component.createEvent()
        advance()

        assertEquals(slotBeforeFailure, harness.component.leagueSlots.value.single())
        assertFalse(harness.loadingHandler.loadingState.value.isLoading)
        assertEquals(
            "offline",
            harness.component.errorState.value?.message,
        )

        val retrySlotStart = instant(1_700_259_200_000)
        harness.eventRepository.createEditorFailure = null
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                startDate = retrySlotStart,
                dayOfWeek = 2,
                daysOfWeek = listOf(2, 4),
                startTimeMinutes = 720,
                endTimeMinutes = 780,
            )
        }
        advance()
        val slotBeforeRetry = harness.component.leagueSlots.value.single()

        harness.component.createEvent()
        advance()

        assertEquals(2, harness.eventRepository.attemptedCreateEventEditorCommands.size)
        assertEquals(1, harness.eventRepository.createEventEditorCalls.size)
        assertNotEquals(
            harness.eventRepository.attemptedCreateEventEditorCommands[0].createOperationId,
            harness.eventRepository.attemptedCreateEventEditorCommands[1].createOperationId,
            "A changed draft must use a new create operation ID.",
        )
        val retrySlot = harness.eventRepository.createEventEditorCalls.single().draft.resources.timeSlots.single()
        assertEquals(slotBeforeRetry.startDate.toString(), retrySlot.startDate)
        assertEquals(slotBeforeRetry.daysOfWeek, retrySlot.daysOfWeek)
        assertEquals(slotBeforeRetry.startTimeMinutes, retrySlot.startTimeMinutes)
        assertEquals(slotBeforeRetry.endTimeMinutes, retrySlot.endTimeMinutes)
        assertEquals(listOf(localFieldId), retrySlot.scheduledFieldIds)
    }

    @Test
    fun given_failed_league_create_when_retry_is_unchanged_then_command_identity_is_preserved() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness()
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            harness.component.onTypeSelected(EventType.LEAGUE)
            advance()
            harness.component.selectFieldCount(1)
            advance()
            harness.component.updateEventField {
                copy(
                    name = "League Retry Identity",
                    organizationId = "org-retry-identity",
                    divisions = listOf("Open"),
                    start = instant(1_700_000_000_000),
                    end = instant(1_700_003_600_000),
                    noFixedEndDateTime = false,
                )
            }
            advance()

            harness.eventRepository.createEditorFailure = IllegalStateException("offline")
            harness.component.createEvent()
            advance()
            assertFalse(harness.loadingHandler.loadingState.value.isLoading)

            harness.eventRepository.createEditorFailure = null
            harness.component.createEvent()
            advance()

            assertEquals(2, harness.eventRepository.attemptedCreateEventEditorCommands.size)
            assertEquals(
                harness.eventRepository.attemptedCreateEventEditorCommands[0],
                harness.eventRepository.attemptedCreateEventEditorCommands[1],
            )
            assertEquals(1, harness.eventRepository.createEventEditorCalls.size)
        }

    @Test
    fun given_failed_one_time_event_when_retry_is_unchanged_then_visible_state_and_command_are_preserved() = runTest(testDispatcher) {
        val session = createEventEditorSession(
            event = com.razumly.mvp.core.data.dataTypes.Event(
                id = "bootstrap-event",
                name = "One-Time Event",
                description = "Visible event description",
                divisions = listOf("open"),
                eventType = EventType.EVENT,
                teamSignup = false,
                singleDivision = false,
                start = instant(1_700_000_000_000),
                end = instant(1_700_003_600_000),
                location = "Main venue",
                address = "1 Main Street",
                organizationId = "organization-1",
            ),
        )
        val harness = CreateEventHarness(bootstrapSession = session)
        advance()

        val visibleStateBeforeFailure = harness.component.newEventState.value
        harness.eventRepository.createEditorFailure = IllegalStateException("offline")
        harness.component.createEvent()
        advance()

        assertEquals(visibleStateBeforeFailure, harness.component.newEventState.value)
        assertEquals(1, harness.eventRepository.attemptedCreateEventEditorCommands.size)
        assertEquals(0, harness.eventRepository.createEventEditorCalls.size)
        assertFalse(harness.loadingHandler.loadingState.value.isLoading)
        assertEquals("offline", harness.component.errorState.value?.message)
        assertEquals(
            "EVENT",
            harness.eventRepository.attemptedCreateEventEditorCommands.single().draft.basics.eventType,
        )

        harness.eventRepository.createEditorFailure = null
        harness.component.createEvent()
        advance()

        assertEquals(2, harness.eventRepository.attemptedCreateEventEditorCommands.size)
        assertEquals(
            harness.eventRepository.attemptedCreateEventEditorCommands[0],
            harness.eventRepository.attemptedCreateEventEditorCommands[1],
        )
        assertEquals(1, harness.eventRepository.createEventEditorCalls.size)
    }

    @Test
    fun given_fixed_end_league_when_tournament_is_selected_then_repeating_slots_use_generated_end() = runTest(testDispatcher) {
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
    fun given_fixed_end_weekly_when_repeating_slot_is_created_then_event_end_is_used() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.WEEKLY_EVENT)
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

        val createdSlots = harness.eventRepository.createEditorCalls.single().timeSlots.orEmpty()
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

        val createdSlots = harness.eventRepository.createEditorCalls.single().timeSlots.orEmpty()
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

        assertEquals(0, harness.eventRepository.createEditorCalls.size)
        assertEquals(
            "Add at least one division before creating this event.",
            harness.component.errorState.value?.message,
        )
    }

    @Test
    fun given_duplicate_division_names_when_submitted_then_creation_is_blocked() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        harness.component.setUseManualTimeSlots(true)
        advance()

        val first = DivisionDetail(
            id = "division_open",
            name = "Open",
            gender = "C",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "adult",
            maxParticipants = 8,
            playoffPlacementDivisionIds = listOf("division_playoff"),
        )
        val second = DivisionDetail(
            id = "division_advanced",
            name = "  open  ",
            gender = "C",
            skillDivisionTypeId = "advanced",
            ageDivisionTypeId = "adult",
            maxParticipants = 8,
        )
        val divisionIds = listOf(first.id, second.id)
        harness.component.updateEventField {
            copy(
                name = "Duplicate Division Names",
                organizationId = "org-open",
                divisions = divisionIds,
                divisionDetails = listOf(first, second),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLocalFieldDivisions(0, divisionIds)
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 2,
                daysOfWeek = listOf(2),
                divisions = divisionIds,
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = harness.component.localFields.value.first().id,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertTrue(harness.eventRepository.createEditorCalls.isEmpty())
        assertEquals(
            "Division name must be unique within this event. Choose a different name.",
            harness.component.errorState.value?.message,
        )
        assertEquals(
            listOf("Open", "  open  "),
            harness.component.newEventState.value.divisionDetails.map(DivisionDetail::name),
        )
    }

    @Test
    fun given_custom_division_name_when_submitted_then_name_is_preserved() = runTest(testDispatcher) {
        val harness = CreateEventHarness()
        advance()

        harness.component.onTypeSelected(EventType.LEAGUE)
        advance()
        harness.component.selectFieldCount(1)
        advance()
        harness.component.setUseManualTimeSlots(true)
        advance()

        val division = DivisionDetail(
            id = "division_elite",
            name = "Elite /  18+",
            gender = "C",
            skillDivisionTypeId = "open",
            ageDivisionTypeId = "adult",
            maxParticipants = 8,
        )
        harness.component.updateEventField {
            copy(
                name = "Custom Division Name",
                organizationId = "org-open",
                divisions = listOf(division.id),
                divisionDetails = listOf(division),
                start = instant(1_700_000_000_000),
                end = instant(1_700_086_400_000),
            )
        }
        harness.component.updateLocalFieldDivisions(0, listOf(division.id))
        harness.component.updateLeagueTimeSlot(0) {
            copy(
                dayOfWeek = 2,
                daysOfWeek = listOf(2),
                divisions = listOf(division.id),
                startTimeMinutes = 600,
                endTimeMinutes = 660,
                scheduledFieldId = harness.component.localFields.value.first().id,
            )
        }
        advance()

        harness.component.createEvent()
        advance()

        assertEquals(
            "Elite /  18+",
            harness.eventRepository.createEditorCalls.single().event.divisionDetails.single().name,
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

        val createCall = harness.eventRepository.createEditorCalls.single()
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

        val createdSlots = harness.eventRepository.createEditorCalls.single().timeSlots.orEmpty()
        assertEquals(2, createdSlots.size)
        assertEquals(listOf("division_a"), createdSlots[0].divisions)
        assertEquals(listOf("division_b"), createdSlots[1].divisions)
    }

    @Test
    fun given_fixed_unscheduled_league_when_tournament_is_selected_then_generated_end_defaults_are_canonical() =
        runTest(testDispatcher) {
            val eventStart = instant(1_700_000_000_000)
            val eventEnd = instant(1_700_086_400_000)
            val harness = CreateEventHarness(
                bootstrapSession = createEventEditorSession(
                    event = com.razumly.mvp.core.data.dataTypes.Event(
                        id = "fixed-unscheduled-league",
                        eventType = EventType.LEAGUE,
                        isAutomatedScheduling = false,
                        noFixedEndDateTime = false,
                        start = eventStart,
                        end = eventEnd,
                        divisions = listOf("Open"),
                    ),
                ),
            )
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            harness.component.onTypeSelected(EventType.TOURNAMENT)
            advance()
            harness.component.selectFieldCount(1)
            advance()
            val fieldId = harness.component.localFields.value.single().id
            harness.component.updateEventField {
                copy(
                    name = "Tournament From Fixed League",
                    organizationId = "org-tournament-from-league",
                    divisions = listOf("Open"),
                )
            }
            advance()
            harness.component.updateLeagueTimeSlot(0) {
                copy(
                    dayOfWeek = 1,
                    daysOfWeek = listOf(1),
                    startTimeMinutes = 600,
                    endTimeMinutes = 660,
                    scheduledFieldId = fieldId,
                    scheduledFieldIds = listOf(fieldId),
                )
            }
            advance()

            harness.component.createEvent()
            advance()

            val command = harness.eventRepository.attemptedCreateEventEditorCommands.single()
            assertTrue(command.draft.schedule.isAutomatedScheduling)
            assertEquals("GENERATED_END", command.draft.schedule.mode)
            assertNull(command.draft.schedule.endConstraint)
            assertEquals(
                EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE,
                command.completion.mode,
            )
        }

    @Test
    fun given_fresh_tournament_selection_without_scheduling_override_when_submitted_then_generated_end_defaults_are_canonical() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness()
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            harness.component.onTypeSelected(EventType.TOURNAMENT)
            advance()
            harness.component.selectFieldCount(1)
            advance()
            val fieldId = harness.component.localFields.value.single().id
            harness.component.updateEventField {
                copy(
                    name = "Fresh Tournament",
                    organizationId = "org-fresh-tournament",
                    divisions = listOf("Open"),
                )
            }
            advance()
            harness.component.updateLeagueTimeSlot(0) {
                copy(
                    dayOfWeek = 1,
                    daysOfWeek = listOf(1),
                    startTimeMinutes = 600,
                    endTimeMinutes = 660,
                    scheduledFieldId = fieldId,
                    scheduledFieldIds = listOf(fieldId),
                )
            }
            advance()

            harness.component.createEvent()
            advance()

            val command = harness.eventRepository.attemptedCreateEventEditorCommands.single()
            assertTrue(command.draft.schedule.isAutomatedScheduling)
            assertEquals("GENERATED_END", command.draft.schedule.mode)
            assertNull(command.draft.schedule.endConstraint)
            assertEquals(
                EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE,
                command.completion.mode,
            )
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

        assertEquals(1, harness.eventRepository.createEditorCalls.size)
        assertEquals(1, harness.onEventCreatedCount)
        assertEquals(0, harness.fieldRepository.createdFields.size)
        assertEquals(0, harness.fieldRepository.createdTimeSlots.size)

        val createCall = harness.eventRepository.createEditorCalls.single()
        assertEquals(1, createCall.fields.orEmpty().size)
        assertEquals(1, createCall.timeSlots.orEmpty().size)
        assertEquals(createCall.timeSlots.orEmpty().map { slot -> slot.id }, createCall.event.timeSlotIds)
        assertNull(createCall.leagueScoringConfig)
    }

    @Test
    fun given_immediate_tournament_edit_when_created_then_first_command_contains_final_values() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness()
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            harness.component.onTypeSelected(EventType.TOURNAMENT)
            advance()
            assertTrue(harness.component.newEventState.value.singleDivision)
            harness.component.selectFieldCount(1)
            advance()

            val eventStart = instant(1_700_000_000_000)
            val eventEnd = instant(1_700_086_400_000)
            harness.component.updateTournamentField {
                copy(
                    name = "Tournament Immediate Edit",
                    organizationId = "org-tournament-immediate",
                    divisions = listOf("Open"),
                    start = eventStart,
                    end = eventEnd,
                    isAutomatedScheduling = true,
                    noFixedEndDateTime = false,
                    doubleElimination = true,
                )
            }
            harness.component.createEvent()
            advance()

            val command = harness.eventRepository.attemptedCreateEventEditorCommands.single()
            assertEquals("TOURNAMENT", command.draft.basics.eventType)
            assertTrue(command.draft.participation.singleDivision)
            assertEquals("Tournament Immediate Edit", command.draft.basics.name)
            assertTrue(command.draft.competition.doubleElimination)
            assertEquals(
                EventEditorCreateCompletionMode.CREATE_AND_BUILD_SCHEDULE,
                command.completion.mode,
            )
            assertTrue(command.hasScheduleProposalSupport)
            assertEquals("FIXED_END", command.draft.schedule.mode)
            assertEquals(eventEnd.toString(), command.draft.schedule.endConstraint)
            assertNull(command.draft.schedule.generatedScheduleEnd)
        }

    @Test
    fun given_fixed_end_unscheduled_tournament_when_submitted_then_create_only_persists_no_schedule_construction() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness()
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            harness.component.onTypeSelected(EventType.TOURNAMENT)
            advance()
            harness.component.selectFieldCount(1)
            advance()

            val eventStart = instant(1_700_000_000_000)
            val eventEnd = instant(1_700_086_400_000)
            harness.component.updateTournamentField {
                copy(
                    name = "Unscheduled Tournament",
                    organizationId = "org-unscheduled-tournament",
                    divisions = listOf("Open"),
                    start = eventStart,
                    end = eventEnd,
                    isAutomatedScheduling = false,
                    noFixedEndDateTime = false,
                )
            }
            advance()

            harness.component.createEvent()
            advance()

            val command = harness.eventRepository.createEventEditorCalls.single()
            val createCall = harness.eventRepository.createEditorCalls.single()
            assertEquals(EventEditorCreateCompletionMode.CREATE_ONLY, command.completion.mode)
            assertFalse(command.hasScheduleProposalSupport)
            assertFalse(command.draft.schedule.isAutomatedScheduling)
            assertEquals("FIXED_END", command.draft.schedule.mode)
            assertEquals(eventEnd.toString(), command.draft.schedule.endConstraint)
            assertNull(command.draft.schedule.generatedScheduleEnd)
            assertTrue(command.draft.resources.timeSlotIds.isEmpty())
            assertTrue(command.draft.resources.timeSlots.isEmpty())
            assertTrue(createCall.event.timeSlotIds.isEmpty())
            assertTrue(createCall.timeSlots.orEmpty().isEmpty())
            assertEquals(eventEnd, createCall.event.end)
        }

    @Test
    fun given_unscheduled_fixed_end_tournament_when_reselected_then_scheduling_state_and_create_command_are_preserved() =
        runTest(testDispatcher) {
            val eventStart = instant(1_700_000_000_000)
            val eventEnd = instant(1_700_086_400_000)
            val harness = CreateEventHarness(
                bootstrapSession = createEventEditorSession(
                    event = com.razumly.mvp.core.data.dataTypes.Event(
                        id = "unscheduled-fixed-end-tournament-reselection",
                        name = "Unscheduled Tournament Reselection",
                        eventType = EventType.TOURNAMENT,
                        isAutomatedScheduling = false,
                        noFixedEndDateTime = false,
                        start = eventStart,
                        end = eventEnd,
                        divisions = listOf("Open"),
                    ),
                ),
            )
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            val configuredState = harness.component.newEventState.value
            assertEquals(EventType.TOURNAMENT, configuredState.eventType)
            assertFalse(configuredState.isAutomatedScheduling)
            assertFalse(configuredState.noFixedEndDateTime)
            assertEquals(eventStart, configuredState.start)
            assertEquals(eventEnd, configuredState.end)

            harness.component.onTypeSelected(EventType.TOURNAMENT)
            advance()

            assertEquals(configuredState, harness.component.newEventState.value)

            harness.component.createEvent()
            advance()

            val command = harness.eventRepository.createEventEditorCalls.single()
            val createCall = harness.eventRepository.createEditorCalls.single()
            assertEquals(EventEditorCreateCompletionMode.CREATE_ONLY, command.completion.mode)
            assertEquals(EventType.TOURNAMENT.name, command.draft.basics.eventType)
            assertEquals(eventStart.toString(), command.draft.basics.start)
            assertFalse(command.draft.schedule.isAutomatedScheduling)
            assertEquals("FIXED_END", command.draft.schedule.mode)
            assertEquals(eventEnd.toString(), command.draft.schedule.endConstraint)
            assertNull(command.draft.schedule.generatedScheduleEnd)
            assertEquals(eventEnd, createCall.event.end)
        }


    @Test
    fun given_unscheduled_tournament_without_a_finite_end_when_submitted_then_creation_is_blocked() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness()
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            harness.component.onTypeSelected(EventType.TOURNAMENT)
            advance()
            harness.component.selectFieldCount(1)
            advance()

            val eventStart = instant(1_700_000_000_000)
            harness.component.updateTournamentField {
                copy(
                    name = "Invalid Tournament End",
                    organizationId = "org-invalid-tournament-end",
                    divisions = listOf("Open"),
                    start = eventStart,
                    end = eventStart,
                    isAutomatedScheduling = false,
                    noFixedEndDateTime = false,
                )
            }
            advance()
            val visibleStateBeforeSubmit = harness.component.newEventState.value

            harness.component.createEvent()
            advance()

            assertEquals(visibleStateBeforeSubmit, harness.component.newEventState.value)
            assertTrue(harness.eventRepository.attemptedCreateEventEditorCommands.isEmpty())
            assertTrue(harness.eventRepository.createEventEditorCalls.isEmpty())
            assertEquals(
                "Unscheduled League/Tournament events require a planned end date and time.",
                harness.component.errorState.value?.message,
            )
        }

    @Test
    fun given_failed_tournament_create_when_retrying_then_unchanged_identity_is_reused_and_edit_gets_new_identity() =
        runTest(testDispatcher) {
            val harness = CreateEventHarness()
            harness.component.setLoadingHandler(harness.loadingHandler)
            advance()

            harness.component.onTypeSelected(EventType.TOURNAMENT)
            advance()
            harness.component.selectFieldCount(2)
            advance()
            val localFieldIds = harness.component.localFields.value.map(Field::id)
            val eventStart = instant(1_700_000_000_000)
            val eventEnd = instant(1_700_086_400_000)

            harness.component.updateTournamentField {
                copy(
                    name = "Tournament Retry Identity",
                    organizationId = "org-tournament-retry",
                    divisions = listOf("Open"),
                    start = eventStart,
                    end = eventEnd,
                    isAutomatedScheduling = false,
                    noFixedEndDateTime = false,
                )
            }
            advance()
            harness.component.updateLocalFieldName(0, "Tournament Court A")
            harness.component.updateLocalFieldName(1, "Tournament Court B")
            harness.component.updateLocalFieldDivisions(0, listOf("Open"))
            harness.component.updateLocalFieldDivisions(1, listOf("Open"))
            harness.component.setUseManualTimeSlots(true)
            advance()
            harness.component.updateLeagueTimeSlot(0) {
                copy(
                    repeating = true,
                    startDate = eventStart,
                    endDate = eventEnd,
                    dayOfWeek = 2,
                    daysOfWeek = listOf(2),
                    startTimeMinutes = 600,
                    endTimeMinutes = 660,
                    scheduledFieldId = localFieldIds.first(),
                    scheduledFieldIds = localFieldIds,
                )
            }
            harness.component.setRegistrationQuestionDrafts(
                listOf(
                    RegistrationQuestionDraft(
                        prompt = "Which division are you entering?",
                        answerType = "LONG_TEXT",
                        required = true,
                    ),
                ),
            )
            assertTrue(
                harness.component.addPendingStaffInvite(
                    firstName = "Tournament",
                    lastName = "Official",
                    email = "tournament-official@example.com",
                    roles = setOf(EventStaffRole.OFFICIAL),
                ).isSuccess,
            )
            advance()

            val visibleStateBeforeFailure = harness.component.newEventState.value
            val localFieldsBeforeFailure = harness.component.localFields.value
            val leagueSlotsBeforeFailure = harness.component.leagueSlots.value
            val useManualTimeSlotsBeforeFailure = harness.component.useManualTimeSlots.value
            val selectedRentalResourceIdsBeforeFailure = harness.component.selectedRentalResourceIds.value
            val registrationQuestionsBeforeFailure = harness.component.registrationQuestionDrafts.value
            val pendingStaffInvitesBeforeFailure = harness.component.pendingStaffInvites.value

            harness.eventRepository.createEditorFailure = IllegalStateException("offline")
            harness.component.createEvent()
            advance()

            assertEquals(visibleStateBeforeFailure, harness.component.newEventState.value)
            assertEquals(localFieldsBeforeFailure, harness.component.localFields.value)
            assertEquals(leagueSlotsBeforeFailure, harness.component.leagueSlots.value)
            assertEquals(useManualTimeSlotsBeforeFailure, harness.component.useManualTimeSlots.value)
            assertEquals(selectedRentalResourceIdsBeforeFailure, harness.component.selectedRentalResourceIds.value)
            assertEquals(registrationQuestionsBeforeFailure, harness.component.registrationQuestionDrafts.value)
            assertEquals(pendingStaffInvitesBeforeFailure, harness.component.pendingStaffInvites.value)
            assertEquals(0, harness.onEventCreatedCount)
            assertFalse(harness.navigatedToSchedule)
            assertEquals(1, harness.eventRepository.attemptedCreateEventEditorCommands.size)
            val firstCommand = harness.eventRepository.attemptedCreateEventEditorCommands.single()
            assertEquals("TOURNAMENT", firstCommand.draft.basics.eventType)

            harness.component.createEvent()
            advance()

            assertEquals(visibleStateBeforeFailure, harness.component.newEventState.value)
            assertEquals(localFieldsBeforeFailure, harness.component.localFields.value)
            assertEquals(leagueSlotsBeforeFailure, harness.component.leagueSlots.value)
            assertEquals(useManualTimeSlotsBeforeFailure, harness.component.useManualTimeSlots.value)
            assertEquals(selectedRentalResourceIdsBeforeFailure, harness.component.selectedRentalResourceIds.value)
            assertEquals(registrationQuestionsBeforeFailure, harness.component.registrationQuestionDrafts.value)
            assertEquals(pendingStaffInvitesBeforeFailure, harness.component.pendingStaffInvites.value)
            assertEquals(0, harness.onEventCreatedCount)
            assertFalse(harness.navigatedToSchedule)
            assertEquals(2, harness.eventRepository.attemptedCreateEventEditorCommands.size)
            assertEquals(
                firstCommand,
                harness.eventRepository.attemptedCreateEventEditorCommands[1],
            )

            harness.component.updateTournamentField { copy(doubleElimination = true) }
            advance()
            harness.eventRepository.createEditorFailure = null
            harness.component.createEvent()
            advance()

            assertEquals(3, harness.eventRepository.attemptedCreateEventEditorCommands.size)
            val editedCommand = harness.eventRepository.attemptedCreateEventEditorCommands[2]
            assertNotEquals(firstCommand.createOperationId, editedCommand.createOperationId)
            assertTrue(editedCommand.draft.competition.doubleElimination)
            assertEquals(1, harness.eventRepository.createEventEditorCalls.size)
            assertEquals(1, harness.onEventCreatedCount)
        }
    @Test
    fun given_club_tryout_bootstrap_when_creating_then_command_has_individual_registration_and_valid_resources() =
        runTest(testDispatcher) {
            val organizationId = "club-tryout-org"
            val field = Field(
                id = "club-field-1",
                name = "Main Court",
                organizationId = organizationId,
            )
            val organization = testTryoutOrganization(organizationId)
            val harness = CreateEventHarness(
                bootstrap = EventEditorBootstrapQueryDto(
                    organizationId = organizationId,
                    eventType = EventType.TRYOUT.name,
                ),
                bootstrapSession = createEventEditorSession(
                    event = Event(
                        id = "tryout-bootstrap",
                        name = "Club Tryouts",
                        hostId = "user-1",
                        organizationId = organizationId,
                        eventType = EventType.TRYOUT,
                        sportIds = listOf("Indoor Volleyball"),
                        start = Instant.parse("2026-07-01T10:00:00Z"),
                        end = Instant.parse("2026-07-01T12:00:00Z"),
                        location = "Main Court",
                        coordinates = listOf(-118.0, 34.0),
                        fieldIds = listOf(field.id),
                    ),
                    fields = listOf(field),
                ),
            )
            harness.billingRepository.organizations = listOf(organization)
            advance()

            harness.component.createEvent()
            advance()

            val command = harness.eventRepository.createEventEditorCalls.single()
            assertFalse(command.draft.participation.teamSignup)
            assertFalse(command.draft.participation.singleDivision)
            assertEquals("FIXED_END", command.draft.schedule.mode)
            assertFalse(command.draft.schedule.generatedScheduleEnd != null)
            assertEquals(listOf(field.id), command.draft.resources.fieldIds)
            assertEquals(1, command.draft.resources.timeSlots.size)
            assertEquals(listOf(field.id), command.draft.resources.timeSlots.single().scheduledFieldIds)
            assertFalse(command.draft.resources.timeSlots.single().repeating == true)
            assertEquals(1, command.draft.competition.divisionDetails.size)
            assertEquals(
                organization.divisions.single().id,
                command.draft.competition.divisionDetails.single().sourceDivisionId,
            )
            val commandDivision = command.draft.competition.divisionDetails.single()
            assertEquals(
                mapOf(commandDivision.id to listOf(field.id)),
                command.draft.competition.divisionFieldIds,
            )
            assertNull(commandDivision.poolPlay)
            assertNull(commandDivision.standingsOverrides)
            assertEquals(EventEditorCreateCompletionMode.CREATE_ONLY, command.completion.mode)
            assertFalse(command.hasScheduleProposalSupport)
            assertFalse(command.draft.competition.includePlayoffs)
            assertNull(command.draft.competition.matchRulesOverride)
            assertFalse(command.draft.staff.doTeamsOfficiate == true)
            assertEquals("OFF", command.draft.staff.teamCheckInMode)
            assertFalse(command.draft.staff.allowMatchRosterEdits)
            assertFalse(command.draft.staff.allowTemporaryMatchPlayers)
            assertFalse(command.draft.staff.autoCreatePointMatchIncidents)
        }

    @Test
    fun given_club_tryout_without_club_features_when_creating_then_command_is_rejected() =
        runTest(testDispatcher) {
            val organizationId = "club-tryout-org"
            val field = Field(
                id = "club-field-1",
                name = "Main Court",
                organizationId = organizationId,
            )
            val organization = testTryoutOrganization(organizationId)
                .copy(enabledFeatures = emptyList())
            val harness = CreateEventHarness(
                bootstrap = EventEditorBootstrapQueryDto(
                    organizationId = organizationId,
                    eventType = EventType.TRYOUT.name,
                ),
                bootstrapSession = createEventEditorSession(
                    event = Event(
                        id = "tryout-bootstrap",
                        name = "Club Tryouts",
                        hostId = "user-1",
                        organizationId = organizationId,
                        eventType = EventType.TRYOUT,
                        sportIds = listOf("Indoor Volleyball"),
                        start = Instant.parse("2026-07-01T10:00:00Z"),
                        end = Instant.parse("2026-07-01T12:00:00Z"),
                        location = "Main Court",
                        coordinates = listOf(-118.0, 34.0),
                    ),
                    fields = listOf(field),
                ),
            )
            harness.billingRepository.organizations = listOf(organization)
            advance()

            harness.component.createEvent()
            advance()

            assertTrue(harness.eventRepository.createEventEditorCalls.isEmpty())
            assertTrue(
                harness.component.errorState.value?.message
                    ?.contains("club and team features", ignoreCase = true) == true,
            )
        }
    @Test
    fun given_failed_proposal_refresh_when_retried_then_new_command_identity_is_reused() =
        runTest(testDispatcher) {
            val harness = partialProposalHarness()
            advance()

            harness.component.createEvent()
            advance()
            val initialCommand = harness.eventRepository.createEventEditorCalls.single()

            harness.eventRepository.createEditorFailure = IllegalStateException("transport timeout")
            harness.component.refreshScheduleProposal()
            advance()

            val failedRefreshCommand =
                harness.eventRepository.attemptedCreateEventEditorCommands[1]
            assertNotEquals(initialCommand.createOperationId, failedRefreshCommand.createOperationId)
            assertEquals(1, harness.eventRepository.createEventEditorCalls.size)
            assertNull(harness.component.pendingScheduleProposal.value)
            assertEquals(ScheduleProposalReviewPhase.FAILED, harness.component.scheduleProposalState.value.phase)

            harness.eventRepository.createEditorFailure = null
            harness.component.refreshScheduleProposal()
            advance()

            val attempts = harness.eventRepository.attemptedCreateEventEditorCommands
            assertEquals(3, attempts.size)
            assertEquals(failedRefreshCommand.createOperationId, attempts[2].createOperationId)
            assertEquals(2, harness.eventRepository.createEventEditorCalls.size)
        }
}

private fun partialProposalHarness(): CreateEventHarness {
    val harness = CreateEventHarness(
        bootstrapSession = createEventEditorSession(
            event = com.razumly.mvp.core.data.dataTypes.Event(
                id = "bootstrap-partial",
                name = "Partial League",
                hostId = "user-1",
                eventType = EventType.LEAGUE,
                sportIds = listOf("Indoor Volleyball"),
                start = Instant.parse("2026-07-01T00:00:00Z"),
                end = Instant.parse("2026-07-01T02:00:00Z"),
                divisions = listOf("Open"),
                isAutomatedScheduling = true,
            ),
        ),
    )
    harness.eventRepository.createEditorOutcomeFactory = { command, session ->
        val proposal = createEventEditorPartialScheduleProposal(command, session)
        com.razumly.mvp.core.data.repositories.EventEditorSaveOutcome(
            session = session,
            staffEmailDelivery = "NOT_REQUESTED",
            scheduleOutcome = proposal.scheduleOutcome,
            proposal = proposal,
        )
    }
    return harness
}

private fun completedRentalOption(
    itemId: String,
    fieldId: String,
    start: Instant,
    end: Instant,
): RentalResourceOption = RentalResourceOption(
    id = "booking-completed:$itemId",
    bookingId = "booking-completed",
    bookingItemId = itemId,
    organizationId = "owner-org",
    organizationName = "Summit Sports",
    field = Field(
        fieldNumber = 1,
        organizationId = "owner-org",
        id = fieldId,
        name = "Court $fieldId",
    ),
    start = start,
    end = end,
    timeZone = "UTC",
    priceCents = 2_500,
)

private fun testTryoutOrganization(organizationId: String): Organization = Organization(
    id = organizationId,
    name = "Club Tryout Organization",
    location = "Los Angeles",
    description = null,
    logoId = null,
    ownerId = "owner-1",
    website = null,
    enabledFeatures = listOf(OrganizationFeature.CLUB_TEAMS),
    divisions = listOf(
        DivisionDetail(
            id = "club-division-1",
            key = "girls_u14",
            kind = "LEAGUE",
            name = "Girls U14",
            divisionTypeId = "skill_competitive_age_u14",
            divisionTypeName = "Competitive U14",
            ratingType = "SKILL",
            gender = "F",
            skillDivisionTypeId = "competitive",
            skillDivisionTypeName = "Competitive",
            ageDivisionTypeId = "u14",
            ageDivisionTypeName = "U14",
            maxParticipants = 12,
        ),
    ),
    hasStripeAccount = false,
    coordinates = null,
)
