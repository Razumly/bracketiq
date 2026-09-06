package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.CurrentUserDataSource
import com.razumly.mvp.core.data.dataTypes.Event
import com.razumly.mvp.core.data.dataTypes.EventRegistrationCacheEntry
import com.razumly.mvp.core.data.dataTypes.Team
import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.isPaymentPending
import com.razumly.mvp.core.data.repositories.EventOccurrenceSelection
import com.razumly.mvp.core.data.repositories.FamilyChild
import com.razumly.mvp.core.data.repositories.IBillingRepository
import com.razumly.mvp.core.data.repositories.IEventRepository
import com.razumly.mvp.core.data.repositories.ITeamRepository
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.PurchaseIntent
import com.razumly.mvp.core.data.repositories.SelfRegistrationResult
import com.razumly.mvp.core.presentation.PaymentResult
import io.github.aakira.napier.Napier
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.withLock

internal class EventRegistrationLifecycleHandler(
    private val userRepository: IUserRepository,
    private val teamRepository: ITeamRepository,
    private val eventRepository: IEventRepository,
    private val billingRepository: IBillingRepository,
    private val currentUserDataSource: CurrentUserDataSource?,
    private val registrationFlowCoordinator: EventRegistrationFlowCoordinator,
    private val divisionContentCoordinator: EventDivisionContentCoordinator,
    private val membershipCoordinator: EventMembershipCoordinator,
    private val joinConfirmationCoordinator: EventJoinConfirmationCoordinator,
    private val participantBootstrapCoordinator: EventParticipantBootstrapCoordinator,
    private val weeklyOccurrenceCoordinator: EventWeeklyOccurrenceCoordinator,
    private val selectedEvent: () -> Event,
    private val selectedDivisionId: () -> String?,
    private val currentUser: () -> UserData,
    private val cachedCurrentUserRegistrations: () -> List<EventRegistrationCacheEntry>,
    private val profileTeamIds: () -> List<String>,
    private val currentWeeklyOccurrenceSelection: () -> EventOccurrenceSelection?,
    private val showPaymentLoading: (String) -> Unit,
    private val finishPaymentLoading: () -> Unit,
    private val refreshEventDetails: () -> Unit,
    private val clearPaymentResult: () -> Unit,
    private val setScheduleTrackedUserIds: (Set<String>) -> Unit,
    private val setMessage: (String) -> Unit,
    private val onSuccessfulJoin: () -> Unit = {},
) {
    private fun currentRegistrationProgressScope(): EventRegistrationProgressScope =
        EventRegistrationProgressScope(
            userId = currentUser().id,
            eventId = selectedEvent().id,
            occurrence = currentWeeklyOccurrenceSelection(),
        )

    private val draftMutex = kotlinx.coroutines.sync.Mutex()
    private val _signupState = kotlinx.coroutines.flow.MutableStateFlow<com.razumly.mvp.core.data.dataTypes.EventSignupState?>(null)
    val signupState = _signupState.asStateFlow()
    private val _signupBusy = kotlinx.coroutines.flow.MutableStateFlow(false)
    val signupBusy = _signupBusy.asStateFlow()
    private var loadedScope: EventRegistrationProgressScope? = null

    fun clearVisibleSignupProgress() {
        _signupState.value = null
        loadedScope = null
        registrationFlowCoordinator.clearForMissingRegistrationScope()
    }

    suspend fun observeCurrentRegistrationProgress() {
        val scope = currentRegistrationProgressScope()
        if (scope != loadedScope) clearVisibleSignupProgress()
        if (scope.userId.isBlank() || scope.eventId.isBlank()) return
        eventRepository.observeRegistrationDraft(scope.eventId, scope.occurrence).collect { state ->
            if (scope != currentRegistrationProgressScope()) return@collect
            if (state == null) {
                _signupState.value = null
                loadedScope = null
                registrationFlowCoordinator.applyRegistrationProgressDraft(null)
                divisionContentCoordinator.restoreSelectedDivision(null)
            } else if (loadedScope != scope) {
                _signupState.value = state.copy(available = false, unavailableReason = "Checking registration progress.")
            } else if (_signupBusy.value) {
                _signupState.value = state
            } else {
                applySharedProgress(state, scope)
            }
        }
    }

    private fun applySharedProgress(state: com.razumly.mvp.core.data.dataTypes.EventSignupState, scope: EventRegistrationProgressScope) {
        _signupState.value = state
        loadedScope = scope
        val draft = state.draft
        val divisionId = registrationFlowCoordinator.applyRegistrationProgressDraft(com.razumly.mvp.core.data.RegistrationProgressDraft(
            scope = "event", userId = scope.userId, eventId = scope.eventId,
            step = draft?.step, answers = draft?.answers.orEmpty(),
            selectedDivisionId = draft?.selectedDivisionId, registrationId = draft?.registrationId,
            holdExpiresAt = draft?.holdExpiresAt, completedSteps = draft?.completedSteps.orEmpty(),
            updatedAt = draft?.updatedAt ?: kotlin.time.Clock.System.now().toString(),
        ))
        divisionContentCoordinator.restoreSelectedDivision(divisionId)
    }

    private suspend fun loadSharedProgress(scope: EventRegistrationProgressScope): Boolean {
        if (scope.userId.isBlank()) { _signupState.value = null; return false }
        val result = eventRepository.loadRegistrationDraft(scope.eventId, scope.occurrence)
        if (scope != currentRegistrationProgressScope()) return false
        return result.fold(onSuccess = { state ->
            applySharedProgress(state, scope)
            state.unavailableReason?.let(setMessage)
            state.invalidations.firstOrNull()?.let(setMessage)
            true
        }, onFailure = { failure ->
            setMessage(failure.message ?: "Could not load registration progress.")
            false
        })
    }

    suspend fun loadCurrentRegistrationProgress() = draftMutex.withLock {
        _signupBusy.value = true
        try { loadSharedProgress(currentRegistrationProgressScope()) }
        finally { _signupBusy.value = false }
    }

    suspend fun saveDraft(change: (com.razumly.mvp.core.data.dataTypes.EventSignupDraft) -> com.razumly.mvp.core.data.dataTypes.EventSignupDraft): Boolean = draftMutex.withLock {
        _signupBusy.value = true
        try {
            val scope = currentRegistrationProgressScope()
            if (loadedScope != scope && !loadSharedProgress(scope)) return@withLock false
            val state = _signupState.value ?: return@withLock false
            if (!state.available) { state.unavailableReason?.let(setMessage); return@withLock false }
            val draft = state.draft ?: com.razumly.mvp.core.data.dataTypes.EventSignupDraft(
                id = "", eventId = scope.eventId, revision = 0, selectedTeamId = state.selectedTeamId,
                slotId = scope.occurrence?.slotId, occurrenceDate = scope.occurrence?.occurrenceDate,
                updatedAt = kotlin.time.Clock.System.now().toString(),
            )
            val currentDivisionId = selectedDivisionId()
            val selectedDraft = draft.copy(
                selectedDivisionId = currentDivisionId,
                selectedDivisionTypeKey = if (currentDivisionId == draft.selectedDivisionId) draft.selectedDivisionTypeKey else null,
            )
            val result = eventRepository.saveRegistrationDraft(scope.eventId, scope.occurrence, draft.revision, change(selectedDraft))
            if (scope != currentRegistrationProgressScope()) return@withLock false
            result.fold(onSuccess = { _signupState.value = it; true }, onFailure = { failure ->
                val current = eventRepository.observeRegistrationDraft(scope.eventId, scope.occurrence).first()
                if (current != null && (current.draft?.revision ?: 0) > draft.revision) applySharedProgress(current, scope)
                setMessage(failure.message ?: "Could not save registration progress.")
                false
            })
        } finally { _signupBusy.value = false }
    }

    suspend fun saveQuestionProgress(): Boolean = saveDraft { draft ->
        draft.copy(answers = registrationFlowCoordinator.answers.value, selectedDivisionId = selectedDivisionId(),
            step = if (registrationFlowCoordinator.areQuestionsConfirmed()) "signing" else "questions",
            completedSteps = if (registrationFlowCoordinator.areQuestionsConfirmed()) (draft.completedSteps + "questions").distinct()
                else draft.completedSteps - "questions")
    }

    suspend fun saveCurrentRegistrationProgress(
        step: String? = null,
        registrationId: String? = null,
        holdExpiresAt: String? = registrationFlowCoordinator.holdExpiresAt.value,
    ) {
        saveDraft { draft -> draft.copy(
            answers = registrationFlowCoordinator.answers.value, selectedDivisionId = selectedDivisionId(),
            step = step ?: draft.step, registrationId = registrationId ?: draft.registrationId,
            completedSteps = if (registrationFlowCoordinator.areQuestionsConfirmed()) (draft.completedSteps + "questions").distinct() else draft.completedSteps - "questions",
        ) }
    }

    suspend fun createRegistrationTeam(team: Team): Result<Team> = draftMutex.withLock {
        val scope = currentRegistrationProgressScope()
        val revision = _signupState.value?.draft?.revision ?: return@withLock Result.failure(IllegalStateException("Load the Team draft first."))
        _signupBusy.value = true
        try {
            eventRepository.createRegistrationTeam(scope.eventId, scope.occurrence, revision, team).also { result ->
                loadSharedProgress(scope)
                result.exceptionOrNull()?.message?.let(setMessage)
            }
        } finally { _signupBusy.value = false }
    }

    suspend fun clearCurrentRegistrationProgress() = draftMutex.withLock {
        val scope = currentRegistrationProgressScope()
        eventRepository.clearRegistrationDraft(scope.eventId, scope.occurrence).onSuccess {
            _signupState.value = null
            loadedScope = null
            registrationFlowCoordinator.clearRegistrationProgressState()
        }.onFailure { setMessage(it.message ?: "Could not clear completed registration progress.") }
    }

    suspend fun addCurrentUserToEventWithRegistrationAnswers(
        event: Event,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<SelfRegistrationResult> =
        registrationFlowCoordinator.addCurrentUserToEventWithRegistrationAnswers(
            event = event,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
            addWithoutAnswers = eventRepository::addCurrentUserToEvent,
            addWithAnswers = eventRepository::addCurrentUserToEvent,
        )

    suspend fun addTeamToEventWithRegistrationAnswers(
        event: Event,
        team: Team,
        preferredDivisionId: String?,
        occurrence: EventOccurrenceSelection?,
    ): Result<Unit> =
        registrationFlowCoordinator.addTeamToEventWithRegistrationAnswers(
            event = event,
            team = team,
            preferredDivisionId = preferredDivisionId,
            occurrence = occurrence,
            addWithoutAnswers = eventRepository::addTeamToEvent,
            addWithAnswers = eventRepository::addTeamToEvent,
        )

    suspend fun createPurchaseIntentWithRegistrationAnswers(
        event: Event,
        teamId: String? = null,
        priceCents: Int,
        occurrence: EventOccurrenceSelection?,
        divisionId: String?,
        discountCode: String? = null,
    ): Result<PurchaseIntent> =
        registrationFlowCoordinator.createPurchaseIntentWithRegistrationAnswers(
            event = event,
            teamId = teamId,
            priceCents = priceCents,
            occurrence = occurrence,
            divisionId = divisionId,
            createWithoutAnswers = { targetEvent, targetTeamId, targetPriceCents, selectedOccurrence, targetDivisionId ->
                billingRepository.createPurchaseIntent(
                    event = targetEvent,
                    teamId = targetTeamId,
                    priceCents = targetPriceCents,
                    occurrence = selectedOccurrence,
                    divisionId = targetDivisionId,
                    discountCode = discountCode,
                )
            },
            createWithAnswers = { targetEvent, targetTeamId, targetPriceCents, selectedOccurrence, targetDivisionId, answers ->
                billingRepository.createPurchaseIntent(
                    event = targetEvent,
                    teamId = targetTeamId,
                    priceCents = targetPriceCents,
                    occurrence = selectedOccurrence,
                    divisionId = targetDivisionId,
                    answers = answers,
                    discountCode = discountCode,
                )
            },
        )

    suspend fun loadRegistrationLifecycleScope(eventId: String) {
        eventRepository.getRegistrationQuestions("EVENT", eventId)
            .onSuccess(registrationFlowCoordinator::replaceRegistrationQuestions)
            .onFailure { throwable ->
                Napier.w("Failed to load event registration questions.", throwable)
                registrationFlowCoordinator.clearRegistrationQuestionsAfterLoadFailure()
            }
        loadCurrentRegistrationProgress()
    }

    suspend fun handleRegistrationPaymentResult(result: PaymentResult) {
        try {
            val pendingTeam = registrationFlowCoordinator.currentPendingTeamRegistration()
            val confirmationTarget = registrationFlowCoordinator.currentJoinConfirmationTarget()
            when (result) {
                PaymentResult.Canceled -> {
                    setMessage("Payment canceled.")
                    registrationFlowCoordinator.clearTeamRegistrationState()
                }

                is PaymentResult.Failed -> {
                    setMessage(result.error)
                    registrationFlowCoordinator.clearTeamRegistrationState()
                }

                PaymentResult.Completed -> {
                    if (pendingTeam != null) {
                        showPaymentLoading("Refreshing Team")
                        registrationFlowCoordinator.clearStartingTeamRegistrationId()
                        val teamRegisteredSuccessfully = joinConfirmationCoordinator.waitForTeamRegistrationWithTimeout(
                            teamId = pendingTeam.team.id,
                            currentUserId = currentUser().id,
                            getTeamWithPlayers = teamRepository::getTeamWithPlayers,
                        )
                        registrationFlowCoordinator.clearPendingTeamRegistration()
                        if (teamRegisteredSuccessfully) {
                            val refreshedTeam = teamRepository.getTeamWithPlayers(pendingTeam.team.id)
                                .getOrNull()
                            val paymentPending = refreshedTeam
                                ?.team
                                ?.playerRegistrations
                                ?.any { registration ->
                                    registration.userId == currentUser().id && registration.isPaymentPending()
                                } == true
                            membershipCoordinator.setUsersTeam(
                                refreshedTeam ?: pendingTeam,
                                currentUser().id,
                            )
                            refreshCurrentUserMembershipState(selectedEvent())
                            setMessage(
                                if (paymentPending) {
                                    "Payment submitted for ${pendingTeam.team.name}. Registration is pending until the bank payment clears."
                                } else {
                                    "Registration completed for ${pendingTeam.team.name}."
                                }
                            )
                            refreshEventDetails()
                            onSuccessfulJoin()
                        } else {
                            setMessage(
                                "Payment submitted, but team registration confirmation is still pending. Please reload the event."
                            )
                        }
                    } else {
                        showPaymentLoading("Reloading Event")
                        val userJoinedSuccessfully = joinConfirmationCoordinator.waitForUserInEventWithTimeout(
                            confirmationTarget = confirmationTarget,
                            isUserInEvent = { membershipCoordinator.isUserInEvent.value },
                            refreshAfterParticipantMutation = {
                                participantBootstrapCoordinator.refreshEventAfterParticipantMutation(
                                    eventId = selectedEvent().id,
                                    warningMessage = "Failed to refresh event while waiting for join confirmation.",
                                )
                            },
                            isJoinConfirmationSatisfied = { target ->
                                joinConfirmationCoordinator.isJoinConfirmationSatisfied(
                                    confirmationTarget = target,
                                    cachedCurrentUserRegistrations = cachedCurrentUserRegistrations,
                                    selectedEvent = selectedEvent,
                                    currentWeeklyOccurrenceSelection = currentWeeklyOccurrenceSelection,
                                    syncCurrentUserRegistrationCache = eventRepository::syncCurrentUserRegistrationCache,
                                    getEvent = eventRepository::getEvent,
                                    syncEventParticipants = { event, occurrence ->
                                        eventRepository.syncEventParticipants(
                                            event = event,
                                            occurrence = occurrence,
                                        )
                                    },
                                    getTeams = teamRepository::getTeams,
                                    applyParticipantSyncResult = participantBootstrapCoordinator::applyParticipantSyncResult,
                                    refreshCurrentUserMembershipState = ::refreshCurrentUserMembershipState,
                                    rememberWeeklyOccurrenceSummary = weeklyOccurrenceCoordinator::rememberWeeklyOccurrenceSummary,
                                )
                            },
                        )
                        if (!userJoinedSuccessfully) {
                            setMessage(
                                "Payment submitted, but event registration confirmation is still pending. Please reload event."
                            )
                        } else if (membershipCoordinator.isRegistrationPaymentPending.value) {
                            setMessage("Payment submitted. Registration is pending until the bank payment clears.")
                        }
                        if (userJoinedSuccessfully) {
                            onSuccessfulJoin()
                        }
                    }
                    clearCurrentRegistrationProgress()
                }
            }
        } finally {
            finishPaymentLoading()
            registrationFlowCoordinator.clearPendingJoinConfirmationTarget()
            clearPaymentResult()
        }
    }

    suspend fun loadJoinableChildren(
        warningMessage: String = "Failed to load linked children before join flow.",
    ): List<JoinChildOption> = userRepository.listChildren()
        .onFailure { throwable ->
            Napier.w(warningMessage, throwable)
        }
        .getOrElse { emptyList() }
        .asSequence()
        .filter { child ->
            child.userId.isNotBlank() &&
                (child.linkStatus?.equals("active", ignoreCase = true) != false)
        }
        .map(FamilyChild::toJoinChildOption)
        .toList()

    suspend fun refreshScheduleTrackedUserIds() {
        val ids = linkedSetOf<String>()
        val currentUserId = currentUser().id.trim()
        if (currentUserId.isNotEmpty()) {
            ids += currentUserId
        }
        loadJoinableChildren()
            .map { child -> child.userId.trim() }
            .filter(String::isNotEmpty)
            .forEach(ids::add)
        setScheduleTrackedUserIds(ids)
    }

    fun checkIsUserWaitListed(event: Event): Boolean =
        membershipCoordinator.checkIsUserWaitListed(
            event = event,
            currentUserId = currentUser().id,
            currentUserTeamIds = currentUserTeamIds(),
            cachedMembership = resolveCachedCurrentUserRegistrationMembership(event),
            weeklyParentWithoutSelection = isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null,
        )

    fun checkIsUserFreeAgent(event: Event): Boolean =
        membershipCoordinator.checkIsUserFreeAgent(
            event = event,
            currentUserId = currentUser().id,
            currentUserTeamIds = currentUserTeamIds(),
            cachedMembership = resolveCachedCurrentUserRegistrationMembership(event),
            weeklyParentWithoutSelection = isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null,
        )

    suspend fun refreshCurrentUserMembershipState(event: Event) {
        val current = currentUser()
        val selectedOccurrence = currentWeeklyOccurrenceSelection()
        val eventIsWeeklyParent = isWeeklyParentEvent(event)
        val missingWeeklySelection = membershipCoordinator.refreshCurrentUserMembershipState(
            event = event,
            currentUserId = current.id,
            profileTeamIds = profileTeamIds(),
            registrations = cachedCurrentUserRegistrations(),
            selectedOccurrence = selectedOccurrence,
            isWeeklyParentEvent = eventIsWeeklyParent,
            weeklyParentWithoutSelection = eventIsWeeklyParent && selectedOccurrence == null,
            getTeamWithPlayers = { teamId ->
                teamRepository.getTeamWithPlayers(teamId).getOrNull()
            },
        )
        if (missingWeeklySelection) {
            registrationFlowCoordinator.clearWithdrawTargets()
        }
    }

    suspend fun refreshWithdrawTargets(event: Event) {
        val current = currentUser()
        registrationFlowCoordinator.replaceWithdrawTargets(
            registrationFlowCoordinator.buildWithdrawTargets(
                currentUserId = current.id,
                currentUserFullName = current.fullName,
                children = loadJoinableChildren(
                    warningMessage = "Failed to load linked children for withdraw targets.",
                ),
            ) { userId ->
                resolveWithdrawTargetMembership(event, userId)
            },
        )
    }

    fun resolveWithdrawTargetMembership(
        event: Event,
        userId: String,
    ): WithdrawTargetMembership? = membershipCoordinator.resolveWithdrawTargetMembership(
        event = event,
        userId = userId,
        currentUserId = currentUser().id,
        profileTeamIds = profileTeamIds(),
        cachedCurrentUserMembership = if (userId == currentUser().id) {
            resolveCachedCurrentUserRegistrationMembership(event)
        } else {
            null
        },
        weeklyParentWithoutSelection = isWeeklyParentEvent(event) && currentWeeklyOccurrenceSelection() == null,
    )

    private fun resolveCachedCurrentUserRegistrationMembership(
        event: Event,
    ): CurrentUserRegistrationMembershipState? = membershipCoordinator.resolveCachedMembership(
        registrations = cachedCurrentUserRegistrations(),
        selectedOccurrence = currentWeeklyOccurrenceSelection(),
        currentUserId = currentUser().id,
        profileTeamIds = profileTeamIds(),
        isWeeklyParentEvent = isWeeklyParentEvent(event),
    )

    private fun currentUserTeamIds(): Set<String> =
        membershipCoordinator.currentUserTeamIds(profileTeamIds())
}

private fun FamilyChild.toJoinChildOption(): JoinChildOption {
    val normalizedFirstName = firstName.trim()
    val normalizedLastName = lastName.trim()
    val fullName = listOf(normalizedFirstName, normalizedLastName)
        .filter(String::isNotBlank)
        .joinToString(" ")
        .ifBlank { "Child" }
    val normalizedEmail = email?.trim()?.takeIf(String::isNotBlank)
    return JoinChildOption(
        userId = userId,
        fullName = fullName,
        email = normalizedEmail,
        hasEmail = hasEmail ?: (normalizedEmail != null),
    )
}
