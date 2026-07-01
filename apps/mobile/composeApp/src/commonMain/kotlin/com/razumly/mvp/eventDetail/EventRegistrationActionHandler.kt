@file:OptIn(ExperimentalTime::class)

package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.dataTypes.BillingAddressDraft
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.TeamWithPlayers
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.data.repositories.TeamRegistrationResult
import com.razumly.mvp.core.data.repositories.userMessage
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.LoadingHandler
import io.github.aakira.napier.Napier
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

internal class EventRegistrationActionHandler(
    private val scope: CoroutineScope,
    private val userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
    private val eventRepository: IEventRepository,
    private val billingRepository: IBillingRepository,
    private val registrationFlowCoordinator: EventRegistrationFlowCoordinator,
    private val joinExecutionCoordinator: EventJoinExecutionCoordinator,
    private val withdrawalActionCoordinator: EventWithdrawalActionCoordinator,
    private val paymentPlanBillingCoordinator: EventPaymentPlanBillingCoordinator,
    private val purchaseIntentCoordinator: EventPurchaseIntentCoordinator,
    private val signatureExecutionCoordinator: EventSignatureExecutionCoordinator,
    private val membershipCoordinator: EventMembershipCoordinator,
    private val weeklyOccurrenceCoordinator: EventWeeklyOccurrenceCoordinator,
    private val loadingHandler: () -> LoadingHandler,
    private val selectedEvent: () -> Event,
    private val selectedDivision: () -> String?,
    private val currentUser: () -> UserData,
    private val currentAccountEmail: () -> String,
    private val isEventFull: () -> Boolean,
    private val currentWeeklyOccurrenceSelection: () -> EventOccurrenceSelection?,
    private val requireSelectedWeeklyOccurrence: (Event, String) -> EventOccurrenceSelection?,
    private val loadJoinableChildren: suspend (String) -> List<JoinChildOption>,
    private val saveCurrentRegistrationProgress: suspend (
        step: String?,
        registrationId: String?,
        holdExpiresAt: String?,
    ) -> Unit,
    private val clearCurrentRegistrationProgress: suspend () -> Unit,
    private val addCurrentUserToEventWithRegistrationAnswers: suspend (
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ) -> Result<SelfRegistrationResult>,
    private val addTeamToEventWithRegistrationAnswers: suspend (
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ) -> Result<Unit>,
    private val createPurchaseIntentWithRegistrationAnswers: suspend (
        event: Event,
        teamId: String?,
        priceCents: Int,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        discountCode: String?,
    ) -> Result<PurchaseIntent>,
    private val refreshEventAfterParticipantMutation: suspend (
        eventId: String,
        warningMessage: String,
    ) -> Unit,
    private val refreshCurrentUserMembershipState: suspend (Event) -> Unit,
    private val refreshEventDetails: () -> Unit,
    private val checkIsUserFreeAgent: (Event) -> Boolean,
    private val resolveWithdrawTargetMembership: (Event, String) -> WithdrawTargetMembership?,
    private val setPaymentIntent: suspend (PurchaseIntent) -> Unit,
    private val clearPaymentResult: () -> Unit,
    private val presentPaymentSheet: (
        email: String,
        name: String,
        billingAddress: BillingAddressDraft?,
    ) -> Unit,
    private val setError: (String) -> Unit,
) {
    fun joinEvent() {
        scope.launch {
            if (!ensureRegistrationOpen()) return@launch
            if (!ensureWeeklyOccurrenceSelectedForRegistration()) return@launch
            if (resumePendingSignatureFlowIfNeeded()) {
                return@launch
            }
            if (!selectedEvent().teamSignup) {
                val children = loadJoinableChildren("Failed to load linked children before join flow.")
                if (children.isNotEmpty()) {
                    registrationFlowCoordinator.showJoinChoiceDialog(children)
                    return@launch
                }
            }
            runSelfJoinFlow()
        }
    }

    fun startTeamRegistration(team: TeamWithPlayers) {
        scope.launch {
            val teamId = registrationFlowCoordinator.registrationTargetTeamId(team.team)
            if (teamId.isBlank() || registrationFlowCoordinator.startingTeamRegistrationId.value != null) return@launch

            if (currentUser().id.isBlank()) {
                setError("Please sign in to join this team.")
                return@launch
            }

            if (!registrationFlowCoordinator.startTeamRegistration(teamId)) return@launch
            try {
                loadingHandler().showLoading("Preparing team registration...")
                val registrationTeam = resolveTeamRegistrationTarget(team).getOrElse { throwable ->
                    setError(throwable.userMessage("Unable to load team registration details."))
                    loadingHandler().hideLoading()
                    return@launch
                }

                val context = teamRepository.getTeamJoinRequestContext(teamId).getOrElse { throwable ->
                    setError(throwable.userMessage("Unable to load team registration questions."))
                    loadingHandler().hideLoading()
                    return@launch
                }

                val joinPolicy = context.joinPolicy
                val joinPolicyDecision = registrationFlowCoordinator.teamJoinPolicyDecision(joinPolicy)
                if (!joinPolicyDecision.isAccepted) {
                    setError(joinPolicyDecision.errorMessage ?: "This team is not accepting registrations.")
                    loadingHandler().hideLoading()
                    return@launch
                }

                if (context.questions.isNotEmpty()) {
                    registrationFlowCoordinator.showTeamJoinQuestionDialog(
                        dialog = TeamJoinQuestionDialogState(
                            teamId = context.teamId,
                            teamName = registrationTeam.team.name.ifBlank { "this team" },
                            joinPolicy = joinPolicy,
                            questions = context.questions,
                        ),
                        team = registrationTeam,
                    )
                    loadingHandler().hideLoading()
                    return@launch
                }

                submitTeamJoin(
                    team = registrationTeam,
                    joinPolicy = joinPolicy,
                    answers = emptyMap(),
                )
                loadingHandler().hideLoading()
            } finally {
                registrationFlowCoordinator.clearStartingTeamRegistrationIfNoPendingTeam()
            }
        }
    }

    fun submitTeamJoinQuestionAnswers(answers: Map<String, String>) {
        val result = registrationFlowCoordinator.submitTeamJoinQuestionAnswers(answers) ?: return
        result.missingQuestion?.let { missingQuestion ->
            setError("Answer \"${missingQuestion.prompt}\" before continuing.")
            return
        }
        val team = result.team
        if (team == null) {
            setError("Unable to continue team registration.")
            return
        }

        val dialog = result.dialog ?: return
        scope.launch {
            val teamId = dialog.teamId.trim().takeIf(String::isNotBlank)
                ?: registrationFlowCoordinator.registrationTargetTeamId(team.team)
            if (!registrationFlowCoordinator.startTeamRegistration(teamId)) return@launch
            try {
                loadingHandler().showLoading(
                    registrationFlowCoordinator.teamJoinSubmitLoadingMessage(dialog.joinPolicy),
                )
                submitTeamJoin(
                    team = team,
                    joinPolicy = dialog.joinPolicy,
                    answers = answers,
                )
                loadingHandler().hideLoading()
            } finally {
                registrationFlowCoordinator.clearStartingTeamRegistrationIfNoPendingTeam()
            }
        }
    }

    fun dismissTeamJoinQuestionDialog() {
        registrationFlowCoordinator.dismissTeamJoinQuestionDialog()
    }

    fun joinEventAsTeam(team: TeamWithPlayers) {
        scope.launch {
            if (!ensureRegistrationOpen()) return@launch
            if (!ensureEventRegistrationQuestionsAnswered { joinEventAsTeam(team) }) return@launch
            membershipCoordinator.setUsersTeam(team, currentUser().id)
            registrationFlowCoordinator.clearJoinDialogs()

            buildPaymentPlanPreviewDialogState(
                event = selectedEvent(),
                ownerLabel = team.team.name.trim().ifBlank { "Your team" },
                forTeamJoin = true,
                preferredDivisionId = selectedDivision(),
                currentUserIsMinor = currentUser().isMinor,
                isEventFull = isEventFull(),
            )?.let { preview ->
                showPaymentPlanPreviewDialog(preview) {
                    scope.launch {
                        runActionAfterRequiredSigning {
                            executeJoinEventAsTeam(team)
                        }
                    }
                }
                return@launch
            }

            runActionAfterRequiredSigning {
                executeJoinEventAsTeam(team)
            }
        }
    }

    fun confirmJoinAsSelf() {
        registrationFlowCoordinator.clearJoinDialogs()
        scope.launch {
            runSelfJoinFlow()
        }
    }

    fun showChildJoinSelection() {
        val children = registrationFlowCoordinator.currentJoinableChildren()
        registrationFlowCoordinator.dismissJoinChoiceDialog()
        if (children.isEmpty()) {
            setError("No linked children are available for registration.")
            registrationFlowCoordinator.dismissChildJoinSelectionDialog()
            return
        }
        registrationFlowCoordinator.showChildJoinSelectionDialog(children)
    }

    fun selectChildForJoin(childUserId: String) {
        if (!ensureRegistrationOpen()) {
            registrationFlowCoordinator.clearJoinDialogs()
            return
        }
        val selectedChild = registrationFlowCoordinator.findJoinableChild(childUserId)
        if (selectedChild == null) {
            setError("Unable to find that child profile.")
            return
        }

        registrationFlowCoordinator.clearJoinDialogs()
        if (!ensureEventRegistrationQuestionsAnswered { selectChildForJoin(childUserId) }) {
            return
        }
        scope.launch {
            runActionAfterRequiredSigning(
                signerContext = SignerContext.PARENT_GUARDIAN,
                child = selectedChild,
            ) {
                executeChildRegistration(selectedChild)
            }
        }
    }

    fun dismissJoinChoiceDialog() {
        registrationFlowCoordinator.dismissJoinChoiceDialog()
    }

    fun dismissChildJoinSelectionDialog() {
        registrationFlowCoordinator.dismissChildJoinSelectionDialog()
    }

    fun requestRefund(reason: String, targetUserId: String?) {
        runWithdrawalAction(
            action = EventWithdrawalExecutionAction.REQUEST_REFUND,
            targetUserId = targetUserId,
            refundReason = reason,
        )
    }

    fun withdrawAndRefund(targetUserId: String?) {
        runWithdrawalAction(
            action = EventWithdrawalExecutionAction.WITHDRAW_AND_REFUND,
            targetUserId = targetUserId,
        )
    }

    fun leaveEvent(targetUserId: String?) {
        runWithdrawalAction(
            action = EventWithdrawalExecutionAction.LEAVE,
            targetUserId = targetUserId,
        )
    }

    fun dismissPaymentPlanPreviewDialog() {
        registrationFlowCoordinator.dismissPaymentPlanPreviewDialog()
    }

    fun confirmPaymentPlanPreviewDialog() {
        registrationFlowCoordinator.confirmPaymentPlanPreviewDialog()?.invoke()
    }

    fun confirmTextSignature() {
        scope.launch {
            signatureExecutionCoordinator.confirmTextSignature(
                eventId = selectedEvent().id,
                recordTeamSignature = { teamId, templateId, documentId, type, signerContext, childUserId ->
                    billingRepository.recordTeamSignature(
                        teamId = teamId,
                        templateId = templateId,
                        documentId = documentId,
                        type = type,
                        signerContext = signerContext,
                        childUserId = childUserId,
                    ).map { Unit }
                },
                recordSignature = { eventId, templateId, documentId, type ->
                    billingRepository.recordSignature(
                        eventId = eventId,
                        templateId = templateId,
                        documentId = documentId,
                        type = type,
                    ).map { Unit }
                },
                getRequiredTeamSignLinks = billingRepository::getRequiredTeamSignLinks,
                getRequiredSignLinks = billingRepository::getRequiredSignLinks,
                pollBoldSignOperation = { operationId ->
                    billingRepository.pollBoldSignOperation(operationId).map { Unit }
                },
                startPolling = { block -> scope.launch { block() } },
                showLoading = loadingHandler()::showLoading,
                hideLoading = loadingHandler()::hideLoading,
                setError = setError,
                logError = { message, throwable -> Napier.e(message, throwable) },
            )
        }
    }

    fun dismissTextSignature() {
        clearPendingSignatureFlow()
        setError("Document signing canceled.")
    }

    fun dismissWebSignaturePrompt() {
        clearPendingSignatureFlow()
        setError("Document signing canceled.")
    }

    fun submitBillingAddress(address: BillingAddressDraft) {
        scope.launch {
            purchaseIntentCoordinator.submitBillingAddress(
                address = address,
                updateBillingAddress = billingRepository::updateBillingAddress,
                showLoading = loadingHandler()::showLoading,
                hideLoading = loadingHandler()::hideLoading,
                setError = setError,
            )
        }
    }

    fun dismissBillingAddressPrompt() {
        registrationFlowCoordinator.dismissBillingAddressPrompt()
    }

    private fun ensureRegistrationOpen(): Boolean {
        val event = selectedEvent()
        val selectedWeeklyOccurrenceStarted = weeklyOccurrenceCoordinator.hasSelectedOccurrenceStarted(Clock.System.now())
        if (!isJoinBlockedByStart(event, selectedWeeklyOccurrenceStarted)) return true
        setError(
            if (
                hasSelectedWeeklyOccurrenceStarted(
                    isWeeklyParent = isWeeklyParentEvent(event),
                    selectedWeeklyOccurrenceStarted = selectedWeeklyOccurrenceStarted,
                )
            ) {
                "This weekly occurrence has already started. Joining is closed."
            } else {
                "This event has already started. Registration is closed."
            }
        )
        return false
    }

    private fun ensureWeeklyOccurrenceSelectedForRegistration(): Boolean {
        val event = selectedEvent()
        if (!isWeeklyParentEvent(event)) {
            return true
        }
        return requireSelectedWeeklyOccurrence(
            event,
            "Select an occurrence before joining or managing registrations.",
        ) != null
    }

    private fun ensureEventRegistrationQuestionsAnswered(onReady: () -> Unit): Boolean {
        return registrationFlowCoordinator.ensureQuestionsAnswered(
            eventName = selectedEvent().name,
            onReady = onReady,
        )
    }

    private suspend fun submitTeamJoin(
        team: TeamWithPlayers,
        joinPolicy: String,
        answers: Map<String, String>,
    ) {
        val teamId = registrationFlowCoordinator.registrationTargetTeamId(team.team)
        if (registrationFlowCoordinator.isRequestToJoinPolicy(joinPolicy)) {
            teamRepository.submitTeamJoinRequest(teamId, answers)
                .onSuccess {
                    refreshEventDetails()
                    setError("Request sent to ${team.team.name}.")
                }.onFailure { throwable ->
                    setError(throwable.userMessage("Unable to submit join request."))
                }
            return
        }

        teamRepository.requestTeamRegistration(teamId, answers)
            .onSuccess { result ->
                handleTeamRegistrationResult(team, result, answers)
            }.onFailure { throwable ->
                setError(throwable.userMessage("Unable to start team registration."))
            }
    }

    private suspend fun resolveTeamRegistrationTarget(team: TeamWithPlayers): Result<TeamWithPlayers> = runCatching {
        val targetTeamId = registrationFlowCoordinator.registrationTargetTeamId(team.team)
        if (targetTeamId.isBlank()) {
            error("Team id is missing.")
        }
        if (targetTeamId == team.team.id.trim()) {
            team
        } else {
            teamRepository.getTeamWithPlayers(targetTeamId).getOrThrow()
        }
    }

    private suspend fun handleTeamRegistrationResult(
        team: TeamWithPlayers,
        result: TeamRegistrationResult,
        answers: Map<String, String> = emptyMap(),
    ) {
        val decision = registrationFlowCoordinator.teamRegistrationResultDecision(result)
        when (decision.action) {
            TeamRegistrationResultAction.WAIT_FOR_PARENT_APPROVAL -> {
                setError(
                    decision.message ?: result.userMessage(
                        "A parent or guardian must approve this team request before registration can continue.",
                    ),
                )
                refreshEventDetails()
                return
            }
            TeamRegistrationResultAction.REQUIRE_CHILD_EMAIL -> {
                setError(decision.message ?: result.userMessage("Add the child's email before continuing."))
                return
            }
            TeamRegistrationResultAction.REQUIRE_ADDITIONAL_SIGNING -> {
                runActionAfterRequiredSigning(teamId = team.team.id) {
                    scope.launch {
                        registrationFlowCoordinator.setStartingTeamRegistrationId(team.team.id)
                        loadingHandler().showLoading("Refreshing team registration...")
                        teamRepository.requestTeamRegistration(team.team.id, answers)
                            .onSuccess { refreshedResult ->
                                continueTeamRegistration(team, refreshedResult)
                            }.onFailure { throwable ->
                                setError(throwable.userMessage("Unable to refresh team registration."))
                            }
                        loadingHandler().hideLoading()
                        registrationFlowCoordinator.clearStartingTeamRegistrationIfNoPendingTeam()
                    }
                }
                return
            }
            TeamRegistrationResultAction.CONTINUE -> {
                continueTeamRegistration(team, result)
            }
        }
    }

    private suspend fun continueTeamRegistration(
        team: TeamWithPlayers,
        result: TeamRegistrationResult,
    ) {
        val decision = registrationFlowCoordinator.teamRegistrationContinuationDecision(team.team, result)
        if (decision.action == TeamRegistrationContinuationAction.MISSING_TEAM_ID) {
            setError(decision.message ?: "This team is missing an id.")
            return
        }

        val teamId = decision.teamId
        registrationFlowCoordinator.setStartingTeamRegistrationId(teamId)
        try {
            if (decision.action == TeamRegistrationContinuationAction.START_CHECKOUT) {
                if (!ensureBillingAddressOrPrompt { scope.launch { continueTeamRegistration(team, result) } }) {
                    return
                }

                loadingHandler().showLoading("Preparing checkout...")
                billingRepository.createTeamRegistrationPurchaseIntent(
                    team = team.team,
                    teamRegistration = result.registration,
                ).onSuccess { intent ->
                    intent.registrationHoldExpiresAt
                        ?.trim()
                        ?.takeIf(String::isNotBlank)
                        ?.let { holdExpiresAt ->
                            registrationFlowCoordinator.setRegistrationHoldExpiresAt(holdExpiresAt)
                            saveCurrentRegistrationProgress(
                                "checkout",
                                intent.registrationId,
                                holdExpiresAt,
                            )
                        }
                    registrationFlowCoordinator.setPendingTeamRegistration(team)
                    showPaymentSheet(intent)
                }.onFailure { throwable ->
                    setError(throwable.userMessage(result.userMessage("Unable to start team registration.")))
                    loadingHandler().hideLoading()
                }
                return
            }

            if (decision.action == TeamRegistrationContinuationAction.REJECT_INACTIVE) {
                setError(decision.message ?: result.userMessage("Unable to join this team."))
                return
            }

            membershipCoordinator.setUsersTeam(
                teamRepository.getTeamWithPlayers(teamId).getOrNull() ?: team,
                currentUser().id,
            )
            refreshCurrentUserMembershipState(selectedEvent())
            refreshEventDetails()
            clearCurrentRegistrationProgress()
            setError("You joined ${team.team.name}.")
        } finally {
            registrationFlowCoordinator.clearStartingTeamRegistrationIfNoPendingTeam()
        }
    }

    private suspend fun resumePendingSignatureFlowIfNeeded(): Boolean {
        if (!registrationFlowCoordinator.hasPendingSignatureFlow()) {
            return false
        }
        loadSignatureStepsForCurrentContext()
        return true
    }

    private suspend fun runSelfJoinFlow(skipPaymentPlanPreview: Boolean = false) {
        if (!ensureRegistrationOpen()) return
        if (!ensureEventRegistrationQuestionsAnswered {
                scope.launch { runSelfJoinFlow(skipPaymentPlanPreview = skipPaymentPlanPreview) }
            }
        ) {
            return
        }
        if (!skipPaymentPlanPreview) {
            buildPaymentPlanPreviewDialogState(
                event = selectedEvent(),
                ownerLabel = "You",
                forTeamJoin = false,
                preferredDivisionId = selectedDivision(),
                currentUserIsMinor = currentUser().isMinor,
                isEventFull = isEventFull(),
            )?.let { preview ->
                showPaymentPlanPreviewDialog(preview) {
                    scope.launch {
                        runSelfJoinFlow(skipPaymentPlanPreview = true)
                    }
                }
                return
            }
        }
        runActionAfterRequiredSigning(
            signerContext = SignerContext.PARTICIPANT,
            child = null,
        ) {
            executeJoinEvent()
        }
    }

    private fun showPaymentPlanPreviewDialog(
        dialogState: PaymentPlanPreviewDialogState,
        onContinue: () -> Unit,
    ) {
        registrationFlowCoordinator.showPaymentPlanPreviewDialog(
            dialogState = dialogState,
            onContinue = onContinue,
        )
    }

    private suspend fun executeChildRegistration(child: JoinChildOption) {
        if (!ensureRegistrationOpen()) return
        val event = selectedEvent()
        val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
            requireSelectedWeeklyOccurrence(
                event,
                "Select an occurrence before registering a child.",
            ) ?: return
        } else {
            null
        }
        joinExecutionCoordinator.executeChildRegistration(
            event = event,
            child = child,
            isEventFull = isEventFull(),
            weeklyOccurrence = weeklyOccurrence,
            registerChildForEvent = eventRepository::registerChildForEvent,
            refreshAfterParticipantMutation = refreshEventAfterParticipantMutation,
            showLoading = loadingHandler()::showLoading,
            hideLoading = loadingHandler()::hideLoading,
            setError = setError,
        )
    }

    private suspend fun createPaymentPlanBillForOwner(
        ownerType: String,
        ownerId: String,
        allowSplit: Boolean,
        preferredDivisionId: String?,
    ): Result<PaymentPlanBillStatus> {
        return paymentPlanBillingCoordinator.createPaymentPlanBillForOwner(
            event = selectedEvent(),
            ownerType = ownerType,
            ownerId = ownerId,
            allowSplit = allowSplit,
            preferredDivisionId = preferredDivisionId,
            selectedWeeklyOccurrence = currentWeeklyOccurrenceSelection(),
            createBill = billingRepository::createBill,
        )
    }

    private suspend fun rollbackUserJoinAfterBillingFailure(event: Event) {
        paymentPlanBillingCoordinator.rollbackUserJoinAfterBillingFailure(
            event = event,
            currentUserId = currentUser().id,
            occurrence = currentWeeklyOccurrenceSelection(),
            removeCurrentUserFromEvent = { targetEvent, targetUserId, occurrence ->
                eventRepository.removeCurrentUserFromEvent(
                    event = targetEvent,
                    targetUserId = targetUserId,
                    occurrence = occurrence,
                )
            },
            logWarning = Napier::w,
        )
    }

    private suspend fun rollbackTeamJoinAfterBillingFailure(event: Event, team: TeamWithPlayers) {
        paymentPlanBillingCoordinator.rollbackTeamJoinAfterBillingFailure(
            event = event,
            team = team,
            occurrence = currentWeeklyOccurrenceSelection(),
            removeTeamFromEvent = { targetEvent, targetTeam, occurrence ->
                eventRepository.removeTeamFromEvent(
                    event = targetEvent,
                    teamWithPlayers = targetTeam,
                    occurrence = occurrence,
                )
            },
            logWarning = Napier::w,
        )
    }

    private suspend fun submitMinorJoinRequestForParentApproval() {
        val event = selectedEvent()
        val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
            requireSelectedWeeklyOccurrence(
                event,
                "Select an occurrence before requesting to join.",
            ) ?: return
        } else {
            null
        }
        joinExecutionCoordinator.submitMinorJoinRequestForParentApproval(
            event = event,
            selectedDivisionId = selectedDivision(),
            weeklyOccurrence = weeklyOccurrence,
            requestCurrentUserRegistration = eventRepository::requestCurrentUserRegistration,
            refreshAfterParticipantMutation = refreshEventAfterParticipantMutation,
            showLoading = loadingHandler()::showLoading,
            setError = setError,
        )
    }

    private suspend fun executeJoinEvent() {
        if (!ensureRegistrationOpen()) return
        val event = selectedEvent()
        val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
            requireSelectedWeeklyOccurrence(
                event,
                "Select an occurrence before joining.",
            ) ?: return
        } else {
            null
        }
        try {
            joinExecutionCoordinator.executeSelfJoin(
                event = event,
                currentUserId = currentUser().id,
                currentUserIsMinor = currentUser().isMinor,
                selectedDivisionId = selectedDivision(),
                isEventFull = isEventFull(),
                weeklyOccurrence = weeklyOccurrence,
                submitMinorJoinRequest = {
                    submitMinorJoinRequestForParentApproval()
                },
                addCurrentUserToEvent = addCurrentUserToEventWithRegistrationAnswers,
                createPaymentPlanBill = { ownerType, ownerId, allowSplit, preferredDivisionId ->
                    createPaymentPlanBillForOwner(
                        ownerType = ownerType,
                        ownerId = ownerId,
                        allowSplit = allowSplit,
                        preferredDivisionId = preferredDivisionId,
                    )
                },
                rollbackUserJoinAfterBillingFailure = { targetEvent ->
                    rollbackUserJoinAfterBillingFailure(targetEvent)
                },
                ensureBillingAddressOrPrompt = { onReady ->
                    ensureBillingAddressOrPrompt(onReady)
                },
                onBillingAddressReady = {
                    scope.launch { executeJoinEvent() }
                },
                createPurchaseIntent = { targetEvent, priceCents, occurrence, divisionId ->
                    val discountCode = registrationFlowCoordinator.requestDiscountCode(
                        title = "Price preview",
                        description = "Review the registration price before checkout. Add a discount code here if you have one.",
                        originalAmountCents = priceCents,
                        onPreview = { code ->
                            scope.launch {
                                val preview = billingRepository.previewEventRegistrationDiscount(
                                    event = targetEvent,
                                    priceCents = priceCents,
                                    occurrence = occurrence,
                                    divisionId = divisionId,
                                    discountCode = code,
                                )
                                registrationFlowCoordinator.updateDiscountCodePreview(preview)
                            }
                        },
                    )
                    createPurchaseIntentWithRegistrationAnswers(
                        targetEvent,
                        null,
                        priceCents,
                        occurrence,
                        divisionId,
                        discountCode,
                    )
                },
                processPurchaseIntent = { purchaseIntent ->
                    processPurchaseIntent(purchaseIntent)
                },
                refreshAfterParticipantMutation = refreshEventAfterParticipantMutation,
                clearRegistrationProgress = {
                    clearCurrentRegistrationProgress()
                },
                setPendingJoinConfirmationTarget = { target ->
                    registrationFlowCoordinator.setPendingJoinConfirmationTarget(target)
                },
                showLoading = loadingHandler()::showLoading,
                setError = setError,
            )
        } finally {
            loadingHandler().hideLoading()
        }
    }

    private suspend fun executeJoinEventAsTeam(team: TeamWithPlayers) {
        if (!ensureRegistrationOpen()) return
        val event = selectedEvent()
        val weeklyOccurrence = if (isWeeklyParentEvent(event)) {
            requireSelectedWeeklyOccurrence(
                event,
                "Select an occurrence before joining with a team.",
            ) ?: return
        } else {
            null
        }
        try {
            joinExecutionCoordinator.executeTeamJoin(
                event = event,
                team = team,
                currentUserIsMinor = currentUser().isMinor,
                selectedDivisionId = selectedDivision(),
                isEventFull = isEventFull(),
                weeklyOccurrence = weeklyOccurrence,
                submitMinorJoinRequest = {
                    submitMinorJoinRequestForParentApproval()
                },
                addTeamToEvent = addTeamToEventWithRegistrationAnswers,
                createPaymentPlanBill = { ownerType, ownerId, allowSplit, preferredDivisionId ->
                    createPaymentPlanBillForOwner(
                        ownerType = ownerType,
                        ownerId = ownerId,
                        allowSplit = allowSplit,
                        preferredDivisionId = preferredDivisionId,
                    )
                },
                rollbackTeamJoinAfterBillingFailure = { targetEvent, targetTeam ->
                    rollbackTeamJoinAfterBillingFailure(targetEvent, targetTeam)
                },
                ensureBillingAddressOrPrompt = { onReady ->
                    ensureBillingAddressOrPrompt(onReady)
                },
                onBillingAddressReady = {
                    scope.launch { executeJoinEventAsTeam(team) }
                },
                createPurchaseIntent = { targetEvent, teamId, priceCents, occurrence, divisionId ->
                    val discountCode = registrationFlowCoordinator.requestDiscountCode(
                        title = "Price preview",
                        description = "Review the team registration price before checkout. Add a discount code here if you have one.",
                        originalAmountCents = priceCents,
                        onPreview = { code ->
                            scope.launch {
                                val preview = billingRepository.previewEventRegistrationDiscount(
                                    event = targetEvent,
                                    teamId = teamId,
                                    priceCents = priceCents,
                                    occurrence = occurrence,
                                    divisionId = divisionId,
                                    discountCode = code,
                                )
                                registrationFlowCoordinator.updateDiscountCodePreview(preview)
                            }
                        },
                    )
                    createPurchaseIntentWithRegistrationAnswers(
                        targetEvent,
                        teamId,
                        priceCents,
                        occurrence,
                        divisionId,
                        discountCode,
                    )
                },
                processPurchaseIntent = { purchaseIntent ->
                    processPurchaseIntent(purchaseIntent)
                },
                refreshAfterParticipantMutation = refreshEventAfterParticipantMutation,
                clearRegistrationProgress = {
                    clearCurrentRegistrationProgress()
                },
                setPendingJoinConfirmationTarget = { target ->
                    registrationFlowCoordinator.setPendingJoinConfirmationTarget(target)
                },
                showLoading = loadingHandler()::showLoading,
                setError = setError,
            )
        } finally {
            loadingHandler().hideLoading()
        }
    }

    private suspend fun runActionAfterRequiredSigning(
        signerContext: SignerContext = SignerContext.PARTICIPANT,
        child: JoinChildOption? = null,
        teamId: String? = null,
        onReady: suspend () -> Unit,
    ) {
        signatureExecutionCoordinator.runActionAfterRequiredSigning(
            eventId = selectedEvent().id,
            signerContext = signerContext,
            child = child,
            currentAccountEmail = userRepository.currentAccount.value.getOrNull()?.email,
            teamId = teamId,
            onReady = onReady,
            getRequiredTeamSignLinks = billingRepository::getRequiredTeamSignLinks,
            getRequiredSignLinks = billingRepository::getRequiredSignLinks,
            pollBoldSignOperation = { operationId ->
                billingRepository.pollBoldSignOperation(operationId).map { Unit }
            },
            startPolling = { block -> scope.launch { block() } },
            setError = setError,
            logError = { message, throwable -> Napier.e(message, throwable) },
        )
    }

    private suspend fun loadSignatureStepsForCurrentContext() {
        signatureExecutionCoordinator.loadSignatureStepsForCurrentContext(
            eventId = selectedEvent().id,
            getRequiredTeamSignLinks = billingRepository::getRequiredTeamSignLinks,
            getRequiredSignLinks = billingRepository::getRequiredSignLinks,
            pollBoldSignOperation = { operationId ->
                billingRepository.pollBoldSignOperation(operationId).map { Unit }
            },
            startPolling = { block -> scope.launch { block() } },
            setError = setError,
            logError = { message, throwable -> Napier.e(message, throwable) },
        )
    }

    private fun clearPendingSignatureFlow() {
        signatureExecutionCoordinator.clearPendingSignatureFlow()
    }

    private fun processPurchaseIntent(intent: PurchaseIntent) {
        purchaseIntentCoordinator.processPurchaseIntent(
            intent = intent,
            saveRegistrationProgress = { registrationId, holdExpiresAt ->
                scope.launch {
                    saveCurrentRegistrationProgress(
                        "checkout",
                        registrationId,
                        holdExpiresAt,
                    )
                }
            },
            launchPaymentSheet = { purchaseIntent ->
                scope.launch { showPaymentSheet(purchaseIntent) }
            },
            setError = setError,
            logWarning = { message -> Napier.w(message) },
        )
    }

    private suspend fun showPaymentSheet(intent: PurchaseIntent) {
        registrationFlowCoordinator.setPendingPaymentSheetIntent(intent)
        showPendingPaymentSheet()
    }

    private suspend fun showPendingPaymentSheet() {
        val intent = registrationFlowCoordinator.consumePendingPaymentSheetIntent() ?: return
        clearPaymentResult()
        setPaymentIntent(intent)
        val billingAddress = loadSavedBillingAddress()
        loadingHandler().showLoading("Waiting for Payment Completion ..")
        presentPaymentSheet(
            currentAccountEmail(),
            currentUser().fullName,
            billingAddress,
        )
    }

    private suspend fun ensureBillingAddressOrPrompt(onReady: () -> Unit): Boolean {
        return purchaseIntentCoordinator.ensureBillingAddressOrPrompt(
            getBillingAddress = billingRepository::getBillingAddress,
            onReady = onReady,
            setError = setError,
        )
    }

    private suspend fun loadSavedBillingAddress(): BillingAddressDraft? {
        return purchaseIntentCoordinator.loadSavedBillingAddress(
            getBillingAddress = billingRepository::getBillingAddress,
        )
    }

    private fun runWithdrawalAction(
        action: EventWithdrawalExecutionAction,
        targetUserId: String?,
        refundReason: String = "",
    ) {
        scope.launch {
            val event = selectedEvent()
            val eventOrOccurrenceStarted = action != EventWithdrawalExecutionAction.REQUEST_REFUND &&
                hasSelectedEventOrOccurrenceStarted(
                    event = event,
                    selectedWeeklyOccurrenceStarted = weeklyOccurrenceCoordinator.hasSelectedOccurrenceStarted(
                        Clock.System.now(),
                    ),
                )

            when (
                val result = withdrawalActionCoordinator.runWithdrawalAction(
                    action = action,
                    event = event,
                    targetUserId = targetUserId,
                    currentUserId = currentUser().id,
                    selectedWeeklyOccurrence = currentWeeklyOccurrenceSelection(),
                    isWeeklyParentEvent = isWeeklyParentEvent(event),
                    currentUserIsFreeAgent = checkIsUserFreeAgent(event),
                    eventOrOccurrenceStarted = eventOrOccurrenceStarted,
                    refundReason = refundReason,
                    resolveMembership = { userId ->
                        resolveWithdrawTargetMembership(event, userId)
                    },
                    usersTeam = {
                        membershipCoordinator.usersTeam()
                    },
                    removeTeamFromEvent = { targetEvent, team, refundMode, reason, occurrence ->
                        eventRepository.removeTeamFromEvent(
                            event = targetEvent,
                            teamWithPlayers = team,
                            refundMode = refundMode,
                            refundReason = reason,
                            occurrence = occurrence,
                        )
                    },
                    removeCurrentUserFromEvent = { targetEvent, userId, occurrence ->
                        eventRepository.removeCurrentUserFromEvent(
                            event = targetEvent,
                            targetUserId = userId,
                            occurrence = occurrence,
                        )
                    },
                    leaveAndRefundEvent = { targetEvent, reason, userId ->
                        billingRepository.leaveAndRefundEvent(
                            event = targetEvent,
                            reason = reason,
                            targetUserId = userId,
                        )
                    },
                    refreshAfterSuccess = refreshEventAfterParticipantMutation,
                    showLoading = loadingHandler()::showLoading,
                    hideLoading = loadingHandler()::hideLoading,
                )
            ) {
                EventWithdrawalExecutionResult.Success -> Unit
                is EventWithdrawalExecutionResult.Rejected -> {
                    setError(result.message)
                }
                is EventWithdrawalExecutionResult.Failed -> {
                    setError(result.message)
                }
            }
        }
    }
}
