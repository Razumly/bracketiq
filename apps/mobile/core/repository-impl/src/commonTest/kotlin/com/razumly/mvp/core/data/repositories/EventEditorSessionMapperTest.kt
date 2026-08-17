package com.razumly.mvp.core.data.repositories

import com.razumly.mvp.core.data.dataTypes.ManualPaymentLink
import com.razumly.mvp.core.network.dto.EVENT_EDITOR_CONTRACT_VERSION
import com.razumly.mvp.core.network.dto.EventEditorBasicsDto
import com.razumly.mvp.core.network.dto.EventEditorCapabilitiesDto
import com.razumly.mvp.core.network.dto.EventEditorCompetitionDto
import com.razumly.mvp.core.network.dto.EventEditorCreateBootstrapDto
import com.razumly.mvp.core.network.dto.EventEditorCreateCommandDto
import com.razumly.mvp.core.network.dto.EventEditorDivisionDetailDto
import com.razumly.mvp.core.network.dto.EventEditorDraftDto
import com.razumly.mvp.core.network.dto.EventEditorFieldDto
import com.razumly.mvp.core.network.dto.EventEditorImmutableDto
import com.razumly.mvp.core.network.dto.EventEditorManualPaymentLinkDto
import com.razumly.mvp.core.network.dto.EventEditorOfficialDto
import com.razumly.mvp.core.network.dto.EventEditorOfficialPositionDto
import com.razumly.mvp.core.network.dto.EventEditorParticipationDto
import com.razumly.mvp.core.network.dto.EventEditorPaymentDto
import com.razumly.mvp.core.network.dto.EventEditorQuestionDto
import com.razumly.mvp.core.network.dto.EventEditorRegistrationDto
import com.razumly.mvp.core.network.dto.EventEditorResourcesDto
import com.razumly.mvp.core.network.dto.EventEditorSaveResultDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleDto
import com.razumly.mvp.core.network.dto.EventEditorSnapshotDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeDto
import com.razumly.mvp.core.network.dto.EventEditorScheduleOutcomeStatus
import com.razumly.mvp.core.network.dto.EventEditorScheduleStateDto
import com.razumly.mvp.core.network.dto.EventEditorStaffDto
import com.razumly.mvp.core.network.dto.EventEditorStaffInviteDto
import com.razumly.mvp.core.network.dto.EventEditorTagDto
import com.razumly.mvp.core.network.dto.EventEditorTimeSlotDto
import com.razumly.mvp.core.util.jsonMVP
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull

private const val TEST_OPERATION_ID = "create-operation-1"
private const val TEST_START = "2026-09-01T10:00:00Z"
private const val TEST_END = "2026-09-01T14:00:00Z"

internal fun editorProtocolSnapshot(
    mode: String = "CREATE",
    editorRevision: String = "new",
    generatedEnd: Boolean = false,
    preserveNullableValues: Boolean = false,
): EventEditorSnapshotDto {
    val division = EventEditorDivisionDetailDto(
        id = "division-1",
        sourceDivisionId = "source-division-1",
        key = "division-key",
        name = "Open",
        kind = "LEAGUE",
        poolPlay = true,
        divisionTypeId = "division-type-1",
        skillDivisionTypeId = "skill-1",
        ageDivisionTypeId = "age-1",
        divisionTypeName = "Open",
        ratingType = "NONE",
        fieldIds = listOf("field-1"),
        teamIds = listOf("team-1"),
    )
    val playoffDivision = division.copy(
        id = "playoff-division-1",
        sourceDivisionId = null,
        key = "playoff-key",
        name = "Playoff",
        kind = "PLAYOFF",
    )
    val start = if (preserveNullableValues) "2026-09-01T10:00" else TEST_START
    val payment = EventEditorPaymentDto(
        mode = "MANUAL",
        priceCents = 2500,
        taxHandling = "INCLUSIVE",
        organizerManualTaxRateBps = 0,
        manualPaymentInstructions = "Pay by check",
        manualPaymentLinks = listOf(
            EventEditorManualPaymentLinkDto(
                id = "payment-link-1",
                provider = "VENMO",
                label = "Venmo",
                url = "https://example.test/pay",
            ),
        ),
        allowPaymentPlans = false,
        installmentCount = if (preserveNullableValues) null else 2,
        installmentDueDates = listOf("2026-08-15T00:00:00Z"),
        installmentDueRelativeDays = listOf(14),
        installmentAmounts = listOf(1250, 1250),
    )
    return EventEditorSnapshotDto(
        contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
        draft = EventEditorDraftDto(
            basics = EventEditorBasicsDto(
                name = "Canonical event",
                description = "Description from the server",
                eventType = "LEAGUE",
                sportIds = listOf("sport-1"),
                start = start,
                timeZone = "UTC",
                location = "Main venue",
                address = "1 Main Street",
                coordinates = listOf(-73.0, 40.0),
                affiliateUrl = "https://example.test/event",
                parentEvent = "parent-event-1",
                organizationId = "organization-1",
                hostId = "host-1",
                state = "UNPUBLISHED",
                imageId = "image-1",
                tags = listOf(EventEditorTagDto(id = "tag-1", slug = "summer", name = "Summer")),
            ),
            participation = EventEditorParticipationDto(
                teamSignup = true,
                singleDivision = false,
                registrationByDivisionType = true,
                teamSizeLimit = if (preserveNullableValues) null else 2,
                maxParticipants = if (preserveNullableValues) null else 64,
                minAge = 18,
                maxAge = 99,
                cancellationRefundHours = 24,
                registrationCutoffHours = 12,
                allowTeamSplitDefault = true,
                waitListIds = listOf("wait-1"),
                freeAgentIds = listOf("free-agent-1"),
            ),
            registration = EventEditorRegistrationDto(
                payment = payment,
                questions = listOf(
                    EventEditorQuestionDto(
                        id = "question-1",
                        clientId = "question-client-1",
                        prompt = "Preferred side?",
                        answerType = "TEXT",
                        required = true,
                        sortOrder = 0,
                    ),
                ),
                requiredDocumentIds = listOf("document-1"),
            ),
            competition = EventEditorCompetitionDto(
                divisionIds = listOf("division-1"),
                divisionDetails = listOf(division),
                playoffDivisionDetails = listOf(playoffDivision),
                divisionFieldIds = mapOf("division-1" to listOf("field-1")),
                winnerSetCount = if (preserveNullableValues) null else 2,
                loserSetCount = if (preserveNullableValues) null else 1,
                doubleElimination = true,
                includePlayoffs = true,
                splitLeaguePlayoffDivisions = false,
                playoffTeamCount = 8,
                pointsToVictory = listOf(21, 15),
                winnerBracketPointsToVictory = listOf(21),
                loserBracketPointsToVictory = listOf(15),
                usesSets = true,
                setsPerMatch = 3,
                setDurationMinutes = 20.0,
                restTimeMinutes = 10.0,
                matchDurationMinutes = 60.0,
                gamesPerOpponent = 2,
                matchRulesOverride = jsonMVP.parseToJsonElement("{\"serveOrder\":\"alternating\"}").jsonObject,
                leagueScoringConfig = jsonMVP.parseToJsonElement("{\"win\":3,\"loss\":0}").jsonObject,
            ),
            schedule = if (generatedEnd) {
                EventEditorScheduleDto(
                    mode = "GENERATED_END",
                    endConstraint = null,
                    generatedScheduleEnd = "2026-09-30",
                )
            } else {
                EventEditorScheduleDto(
                    mode = "FIXED_END",
                    endConstraint = TEST_END,
                    generatedScheduleEnd = null,
                )
            },
            resources = EventEditorResourcesDto(
                fieldIds = listOf("field-1"),
                fields = listOf(
                    EventEditorFieldDto(
                        id = "field-1",
                        name = "Court 1",
                        location = "Building A",
                        address = "1 Main Street",
                        lat = 40.0,
                        long = -73.0,
                        inUse = true,
                        sportIds = listOf("sport-1"),
                        organizationId = "organization-1",
                        facilityId = "facility-1",
                    ),
                ),
                timeSlotIds = listOf("slot-1"),
                timeSlots = listOf(
                    EventEditorTimeSlotDto(
                        id = "slot-1",
                        eventId = "event-1",
                        daysOfWeek = listOf(2, 4),
                        startTimeMinutes = 600,
                        endTimeMinutes = 660,
                        startDate = start,
                        endDate = TEST_END,
                        timeZone = "UTC",
                        scheduledFieldIds = listOf("field-1"),
                        divisions = listOf("division-1"),
                        requiredTemplateIds = listOf("template-1"),
                        hostRequiredTemplateIds = listOf("host-template-1"),
                        repeating = false,
                        sourceType = "EVENT",
                    ),
                ),
                requiredTemplateIds = listOf("template-1"),
                immutableFieldIds = listOf("field-immutable-1"),
                rentalBookingId = "rental-1",
                rentalBookingItemId = "rental-item-1",
            ),
            staff = EventEditorStaffDto(
                officialSchedulingMode = "STAFFING",
                teamOfficialsMaySwap = true,
                teamCheckInMode = "MATCH",
                teamCheckInOpenMinutesBefore = 30,
                allowMatchRosterEdits = true,
                allowTemporaryMatchPlayers = true,
                autoCreatePointMatchIncidents = true,
                officialIds = listOf("official-1"),
                officialPositions = listOf(EventEditorOfficialPositionDto("position-1", "Referee", 2, 0)),
                eventOfficials = listOf(
                    EventEditorOfficialDto(
                        id = "event-official-1",
                        userId = "official-1",
                        positionIds = listOf("position-1"),
                        fieldIds = listOf("field-1"),
                        isActive = true,
                    ),
                ),
                assistantHostIds = listOf("assistant-1"),
                pendingInvites = listOf(
                    EventEditorStaffInviteDto(
                        id = "invite-1",
                        email = "official@example.test",
                        firstName = "Official",
                        lastName = "User",
                        roles = listOf("OFFICIAL"),
                        staffTypes = listOf("OFFICIAL"),
                        type = "STAFF",
                        status = "PENDING",
                        eventId = "event-1",
                        organizationId = "organization-1",
                    ),
                ),
            ),
        ),
        mode = mode,
        eventId = if (mode == "EDIT") "event-1" else null,
        editorRevision = editorRevision,
        staffRevision = "staff-revision-1",
        capabilities = EventEditorCapabilitiesDto(
            canUseOnlinePayments = true,
            canManageStaff = true,
            canEdit = true,
            supportsTeamStaffing = true,
        ),
        catalogs = com.razumly.mvp.core.network.dto.EventEditorCatalogsDto(),
        immutable = EventEditorImmutableDto(
            fieldNames = listOf("field-immutable-1"),
            rental = true,
            template = true,
        ),
        scheduleState = EventEditorScheduleStateDto(
            sourceType = null,
            matchCount = 0,
            revision = if (mode == "CREATE") "new" else "schedule-revision-1",
            hasProtectedHistory = false,
        ),
    )
}

internal fun editorProtocolBootstrap(
    snapshot: EventEditorSnapshotDto = editorProtocolSnapshot(),
): EventEditorCreateBootstrapDto = EventEditorCreateBootstrapDto(
    contractVersion = EVENT_EDITOR_CONTRACT_VERSION,
    createOperationId = TEST_OPERATION_ID,
    snapshot = snapshot,
)

class EventEditorSessionMapperTest {
    @Test
    fun decodes_and_projects_complete_editor_bootstrap() {
        val wire = jsonMVP.encodeToString(editorProtocolBootstrap())
        val bootstrap = jsonMVP.decodeFromString<EventEditorCreateBootstrapDto>(wire)
        val session = EventEditorSessionMapper.fromCreateBootstrap(bootstrap)
        val canonical = session.canonicalState

        assertEquals(TEST_OPERATION_ID, session.createOperationId)
        assertEquals("Canonical event", canonical.event.name)
        assertEquals("MANUAL", canonical.event.registrationPaymentMode)
        assertEquals(listOf("field-1"), canonical.event.fieldIds)
        assertEquals("field-1", assertNotNull(canonical.fields.singleOrNull()).id)
        assertEquals(listOf("division-1"), canonical.fields.single().divisions)
        assertEquals("question-client-1", canonical.questions.single().clientId)
        assertEquals("official@example.test", canonical.pendingStaffInvites.single().email)
        assertEquals("playoff-division-1", canonical.playoffDivisionDetails.single().id)
        assertEquals(listOf("field-1"), canonical.divisionFieldIds["division-1"])
        assertEquals("summer", canonical.event.tags.single().slug)
    }

    @Test
    fun builds_stable_create_command_without_erasing_open_snapshot_records() {
        val session = EventEditorSessionMapper.fromCreateBootstrap(editorProtocolBootstrap())
        val mutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                event = session.canonicalState.event.copy(name = "Changed event"),
                questions = listOf(session.canonicalState.questions.single().copy(prompt = "Updated question")),
                pendingStaffInvites = listOf(session.canonicalState.pendingStaffInvites.single().copy(firstName = "Updated")),
            ),
        )

        val first = EventEditorSessionMapper.toCreateCommand(session, mutation).command
        val second = EventEditorSessionMapper.toCreateCommand(session, mutation).command
        val firstWire = jsonMVP.encodeToString(first)
        val secondWire = jsonMVP.encodeToString(second)
        val decoded = jsonMVP.decodeFromString<EventEditorCreateCommandDto>(firstWire)

        assertEquals(firstWire, secondWire)
        assertEquals(TEST_OPERATION_ID, decoded.createOperationId)
        assertEquals("Changed event", decoded.draft.basics.name)
        assertEquals("Updated question", decoded.draft.registration.questions.single().prompt)
        assertEquals("question-client-1", decoded.draft.registration.questions.single().clientId)
        assertEquals(listOf("document-1"), decoded.draft.registration.requiredDocumentIds)
        assertEquals(listOf("field-immutable-1"), decoded.draft.resources.immutableFieldIds)
        assertEquals("Updated", decoded.draft.staff.pendingInvites.single().firstName)
    }

    @Test
    fun create_command_maps_division_playoff_count_to_required_competition_field() {
        val snapshot = editorProtocolSnapshot()
        val session = EventEditorSessionMapper.fromCreateBootstrap(
            editorProtocolBootstrap(
                snapshot = snapshot.copy(
                    draft = snapshot.draft.copy(
                        competition = snapshot.draft.competition.copy(playoffTeamCount = null),
                    ),
                ),
            ),
        )
        val mutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                event = session.canonicalState.event.copy(
                    playoffTeamCount = null,
                    divisionDetails = session.canonicalState.event.divisionDetails.map { detail ->
                        detail.copy(playoffTeamCount = 8)
                    },
                ),
            ),
        )

        val command = EventEditorSessionMapper.toCreateCommand(session, mutation).command

        assertEquals(8, command.draft.competition.playoffTeamCount)
        assertEquals(8.0, command.draft.competition.divisionDetails.single().playoffTeamCount)
    }

    @Test
    fun multi_division_league_keeps_playoff_counts_on_divisions_only() {
        val snapshot = editorProtocolSnapshot()
        val firstDivision = snapshot.draft.competition.divisionDetails.single().copy(
            playoffTeamCount = 8.0,
        )
        val secondDivision = firstDivision.copy(
            id = "division-2",
            key = "division-key-2",
            name = "Advanced",
            playoffTeamCount = 4.0,
        )
        val session = EventEditorSessionMapper.fromCreateBootstrap(
            editorProtocolBootstrap(
                snapshot = snapshot.copy(
                    draft = snapshot.draft.copy(
                        competition = snapshot.draft.competition.copy(
                            divisionIds = listOf("division-1", "division-2"),
                            divisionDetails = listOf(firstDivision, secondDivision),
                            playoffTeamCount = 8,
                        ),
                    ),
                ),
            ),
        )

        assertNull(session.canonicalState.event.playoffTeamCount)

        val command = EventEditorSessionMapper.toCreateCommand(
            session = session,
            mutation = EventEditorMutation(
                canonicalState = session.canonicalState.copy(
                    event = session.canonicalState.event.copy(
                        playoffTeamCount = 8,
                    ),
                ),
            ),
        ).command

        assertNull(command.draft.competition.playoffTeamCount)
        assertEquals(
            listOf(8.0, 4.0),
            command.draft.competition.divisionDetails.map { detail -> detail.playoffTeamCount },
        )
    }

    @Test
    fun create_command_normalizes_manual_payment_usernames_to_backend_urls() {
        val session = EventEditorSessionMapper.fromCreateBootstrap(editorProtocolBootstrap())
        val mutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                event = session.canonicalState.event.copy(
                    manualPaymentLinks = listOf(
                        ManualPaymentLink(
                            id = "payment-link-1",
                            provider = "VENMO",
                            label = "Venmo",
                            url = "@camka14",
                        ),
                    ),
                ),
            ),
        )

        val command = EventEditorSessionMapper.toCreateCommand(session, mutation).command

        assertEquals(
            "https://venmo.com/u/camka14",
            command.draft.registration.payment.manualPaymentLinks.single().url,
        )
    }

    @Test
    fun create_command_rejects_invalid_manual_payment_urls_before_network_request() {
        val session = EventEditorSessionMapper.fromCreateBootstrap(editorProtocolBootstrap())
        val mutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                event = session.canonicalState.event.copy(
                    manualPaymentLinks = listOf(
                        ManualPaymentLink(
                            id = "payment-link-1",
                            provider = "CASH_APP",
                            label = "Cash App",
                            url = "\$",
                        ),
                    ),
                ),
            ),
        )

        val error = assertFailsWith<IllegalArgumentException> {
            EventEditorSessionMapper.toCreateCommand(session, mutation)
        }

        assertEquals("Invalid manual payment URL.", error.message)
    }

    @Test
    fun field_division_edits_update_the_canonical_division_field_map() {
        val session = EventEditorSessionMapper.fromCreateBootstrap(editorProtocolBootstrap())
        val mutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                fields = session.canonicalState.fields.map { field -> field.copy(divisions = emptyList()) },
            ),
        )

        val command = EventEditorSessionMapper.toCreateCommand(session, mutation).command

        assertEquals(emptyList(), command.draft.competition.divisionFieldIds["division-1"])
    }

    @Test
    fun replacing_a_field_drops_removed_field_ids_from_division_assignments() {
        val session = EventEditorSessionMapper.fromCreateBootstrap(editorProtocolBootstrap())
        val mutation = EventEditorMutation(
            canonicalState = session.canonicalState.copy(
                event = session.canonicalState.event.copy(fieldIds = listOf("field-2")),
                fields = listOf(
                    session.canonicalState.fields.single().copy(
                        id = "field-2",
                        divisions = listOf("division-1"),
                    ),
                ),
            ),
        )
        val command = EventEditorSessionMapper.toCreateCommand(session, mutation).command

        assertEquals(listOf("field-2"), command.draft.competition.divisionFieldIds["division-1"])
        assertEquals(listOf("field-2"), command.draft.resources.fieldIds)
    }

    @Test
    fun partial_field_mutation_preserves_assignments_for_active_baseline_fields() {
        val snapshot = editorProtocolSnapshot()
        val secondField = snapshot.draft.resources.fields.single().copy(
            id = "field-2",
            name = "Court 2",
        )
        val session = EventEditorSessionMapper.fromCreateBootstrap(
            editorProtocolBootstrap(
                snapshot = snapshot.copy(
                    draft = snapshot.draft.copy(
                        competition = snapshot.draft.competition.copy(
                            divisionFieldIds = mapOf("division-1" to listOf("field-1", "field-2")),
                        ),
                        resources = snapshot.draft.resources.copy(
                            fieldIds = listOf("field-1", "field-2"),
                            fields = snapshot.draft.resources.fields + secondField,
                        ),
                    ),
                ),
            ),
        )
        val updatedField = session.canonicalState.fields.single { field -> field.id == "field-2" }
            .copy(name = "Updated Court 2")
        val command = EventEditorSessionMapper.toCreateCommand(
            session = session,
            mutation = EventEditorMutation(
                canonicalState = session.canonicalState.copy(fields = listOf(updatedField)),
            ),
        ).command

        assertEquals(
            listOf("field-1", "field-2"),
            command.draft.competition.divisionFieldIds["division-1"],
        )
    }

    @Test
    fun state_only_mutation_preserves_nullable_defaults_and_generated_schedule_text() {
        val session = EventEditorSessionMapper.fromCreateBootstrap(
            editorProtocolBootstrap(
                editorProtocolSnapshot(generatedEnd = true, preserveNullableValues = true),
            ),
        )
        val command = EventEditorSessionMapper.toCreateCommand(
            session,
            EventEditorMutation(session.canonicalState.copy(event = session.canonicalState.event.copy(state = "PUBLISHED"))),
        ).command

        assertEquals("PUBLISHED", command.draft.basics.state)
        assertEquals("2026-09-01T10:00", command.draft.basics.start)
        assertEquals("GENERATED_END", command.draft.schedule.mode)
        assertEquals("2026-09-30", command.draft.schedule.generatedScheduleEnd)
        assertEquals(null, command.draft.participation.teamSizeLimit)
        assertEquals(null, command.draft.participation.maxParticipants)
        assertEquals(null, command.draft.competition.winnerSetCount)
        assertEquals(null, command.draft.competition.loserSetCount)
        assertEquals(null, command.draft.registration.payment.installmentCount)
    }

    @Test
    fun builds_edit_command_with_revisions_and_applies_returned_canonical_state() {
        val editSession = EventEditorSessionMapper.fromEditSnapshot(
            editorProtocolSnapshot(mode = "EDIT", editorRevision = "revision-1"),
        )
        val mutation = EventEditorMutation(editSession.canonicalState.copy(event = editSession.canonicalState.event.copy(description = "Edited")))
        val command = EventEditorSessionMapper.toSaveCommand(editSession, mutation)
        val resultSnapshot = editSession.snapshot.copy(editorRevision = "revision-2", draft = command.draft)
        val outcome = EventEditorSessionMapper.applySaveResult(
            EventEditorSaveResultDto(
                status = "SAVED",
                snapshot = resultSnapshot,
                staffEmailDelivery = "NOT_REQUESTED",
                scheduleOutcome = EventEditorScheduleOutcomeDto(
                    status = EventEditorScheduleOutcomeStatus.NOT_REQUESTED,
                    matchCount = 0,
                ),
            ),
            editSession,
        )

        assertEquals("revision-1", command.editorRevision)
        assertEquals("staff-revision-1", command.staffRevision)
        assertEquals("revision-2", outcome.snapshot.editorRevision)
        assertEquals("Edited", outcome.canonicalState.event.description)
        assertEquals(null, outcome.createOperationId)
    }
}
