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
) {
    private fun currentRegistrationProgressScope(): EventRegistrationProgressScope =
        EventRegistrationProgressScope(
            userId = currentUser().id,
            eventId = selectedEvent().id,
            occurrence = currentWeeklyOccurrenceSelection(),
        )

    suspend fun saveCurrentRegistrationProgress(
        step: String? = null,
        registrationId: String? = null,
        holdExpiresAt: String? = registrationFlowCoordinator.holdExpiresAt.value,
    ) {
        registrationFlowCoordinator.saveRegistrationProgress(
            scope = currentRegistrationProgressScope(),
            selectedDivisionId = selectedDivisionId(),
            step = step,
            registrationId = registrationId,
            holdExpiresAt = holdExpiresAt,
        ) { key, draft ->
            currentUserDataSource?.saveRegistrationProgress(
                key = key,
                draft = draft,
            )
        }
    }

    private suspend fun loadCurrentRegistrationProgress() {
        registrationFlowCoordinator.loadRegistrationProgress(
            scope = currentRegistrationProgressScope(),
        ) { key ->
            currentUserDataSource?.loadRegistrationProgress(key)
        }
            ?.let(divisionContentCoordinator::restoreSelectedDivision)
    }

    suspend fun clearCurrentRegistrationProgress() {
        registrationFlowCoordinator.clearRegistrationProgress(
            scope = currentRegistrationProgressScope(),
        ) { key ->
            currentUserDataSource?.clearRegistrationProgress(key)
        }
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
