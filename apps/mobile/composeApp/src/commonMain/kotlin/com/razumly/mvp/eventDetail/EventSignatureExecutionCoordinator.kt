package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import com.razumly.mvp.core.network.userMessage
import com.razumly.mvp.core.util.trustedBoldSignSigningUrlOrNull
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlin.time.Clock
import kotlin.time.Duration.Companion.seconds
import kotlin.time.ExperimentalTime

@OptIn(ExperimentalTime::class)
internal class EventSignatureExecutionCoordinator(
    private val registrationFlowCoordinator: EventRegistrationFlowCoordinator,
    private val pollIntervalMillis: Long = 2.seconds.inWholeMilliseconds,
    private val pollTimeoutMillis: Long = 60.seconds.inWholeMilliseconds,
) {
    suspend fun runActionAfterRequiredSigning(
        eventId: String,
        signerContext: SignerContext,
        child: JoinChildOption?,
        currentAccountEmail: String?,
        teamId: String?,
        onReady: suspend () -> Unit,
        getRequiredTeamSignLinks: suspend (
            teamId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        getRequiredSignLinks: suspend (
            eventId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        pollBoldSignOperation: suspend (operationId: String) -> Result<Unit>,
        startPolling: (suspend () -> Unit) -> Job,
        setError: (String) -> Unit,
        logError: (String, Throwable) -> Unit,
    ) {
        registrationFlowCoordinator.startRequiredSignatureFlow(
            signerContext = signerContext,
            child = child,
            currentAccountEmail = currentAccountEmail,
            teamId = teamId,
            onReady = onReady,
        )
        loadSignatureStepsForCurrentContext(
            eventId = eventId,
            getRequiredTeamSignLinks = getRequiredTeamSignLinks,
            getRequiredSignLinks = getRequiredSignLinks,
            pollBoldSignOperation = pollBoldSignOperation,
            startPolling = startPolling,
            setError = setError,
            logError = logError,
        )
    }

    suspend fun fetchRequiredSignatureStepsForCurrentContext(
        eventId: String,
        getRequiredTeamSignLinks: suspend (
            teamId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        getRequiredSignLinks: suspend (
            eventId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
    ): Result<List<SignStep>> {
        if (!registrationFlowCoordinator.hasSignatureContexts()) {
            return Result.success(emptyList())
        }

        val target = registrationFlowCoordinator.currentSignatureFetchTarget()
        val context = target.signerContext

        return target.teamId?.let { targetTeamId ->
            getRequiredTeamSignLinks(
                targetTeamId,
                context,
                target.child?.userId,
                target.child?.email,
            )
        } ?: getRequiredSignLinks(
            eventId,
            context,
            target.child?.userId,
            target.child?.email,
        )
    }

    suspend fun confirmTextSignature(
        eventId: String,
        recordTeamSignature: suspend (
            teamId: String,
            templateId: String,
            documentId: String,
            type: String,
            signerContext: SignerContext,
            childUserId: String?,
        ) -> Result<Unit>,
        recordSignature: suspend (
            eventId: String,
            templateId: String,
            documentId: String,
            type: String,
        ) -> Result<Unit>,
        getRequiredTeamSignLinks: suspend (
            teamId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        getRequiredSignLinks: suspend (
            eventId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        pollBoldSignOperation: suspend (operationId: String) -> Result<Unit>,
        startPolling: (suspend () -> Unit) -> Job,
        showLoading: (String) -> Unit,
        hideLoading: () -> Unit,
        setError: (String) -> Unit,
        logError: (String, Throwable) -> Unit,
        nowMillis: () -> Long = { Clock.System.now().toEpochMilliseconds() },
    ) {
        val prompt = registrationFlowCoordinator.textSignaturePrompt.value ?: return

        showLoading("Recording signature ...")
        try {
            val documentId = prompt.step.resolvedDocumentId()
                ?: "mobile-text-${prompt.step.templateId}-${nowMillis()}"
            val signatureTarget = registrationFlowCoordinator.currentSignatureRecordingTarget()
            val recordSignatureResult = signatureTarget.teamId?.let { targetTeamId ->
                recordTeamSignature(
                    targetTeamId,
                    prompt.step.templateId,
                    documentId,
                    prompt.step.type,
                    signatureTarget.signerContext,
                    signatureTarget.child?.userId,
                )
            } ?: recordSignature(
                eventId,
                prompt.step.templateId,
                documentId,
                prompt.step.type,
            )

            recordSignatureResult.onFailure { throwable ->
                logError("Failed to record signature.", throwable)
                setError(throwable.userMessage("Failed to record signature."))
            }.onSuccess {
                registrationFlowCoordinator.clearTextSignaturePrompt()
                if (
                    awaitSignatureStepClearance(
                        eventId = eventId,
                        step = prompt.step,
                        getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                        getRequiredSignLinks = getRequiredSignLinks,
                        pollBoldSignOperation = pollBoldSignOperation,
                        setError = setError,
                        logError = logError,
                    )
                ) {
                    processNextSignatureStep(
                        eventId = eventId,
                        getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                        getRequiredSignLinks = getRequiredSignLinks,
                        pollBoldSignOperation = pollBoldSignOperation,
                        startPolling = startPolling,
                        setError = setError,
                        logError = logError,
                    )
                }
            }
        } finally {
            hideLoading()
        }
    }

    fun clearPendingSignatureFlow() {
        registrationFlowCoordinator.clearPendingSignatureFlow()
    }

    private suspend fun awaitSignatureStepClearance(
        eventId: String,
        step: SignStep,
        getRequiredTeamSignLinks: suspend (
            teamId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        getRequiredSignLinks: suspend (
            eventId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        pollBoldSignOperation: suspend (operationId: String) -> Result<Unit>,
        setError: (String) -> Unit,
        logError: (String, Throwable) -> Unit,
        operationId: String? = step.operationId,
    ): Boolean {
        val normalizedOperationId = operationId?.trim()?.takeIf(String::isNotBlank)
        if (normalizedOperationId != null) {
            setError("Waiting for signature sync...")
            pollBoldSignOperation(normalizedOperationId).getOrElse { throwable ->
                logError("Failed to poll BoldSign operation.", throwable)
                setError(throwable.userMessage("Failed to confirm signature status."))
                clearPendingSignatureFlow()
                return false
            }
        }

        var elapsedMillis = 0L
        while (elapsedMillis <= pollTimeoutMillis) {
            setError("Waiting for signature sync...")
            val refreshedSteps = fetchRequiredSignatureStepsForCurrentContext(
                eventId = eventId,
                getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                getRequiredSignLinks = getRequiredSignLinks,
            ).getOrElse { throwable ->
                logError("Failed to refresh required signing documents.", throwable)
                setError(throwable.userMessage("Failed to confirm signature status."))
                clearPendingSignatureFlow()
                return false
            }

            if (refreshedSteps.none { refreshedStep -> pendingSignatureStepsMatch(refreshedStep, step) }) {
                registrationFlowCoordinator.replacePendingSignatureSteps(refreshedSteps)
                return true
            }

            if (elapsedMillis >= pollTimeoutMillis) {
                break
            }

            delay(pollIntervalMillis)
            elapsedMillis += pollIntervalMillis
        }

        clearPendingSignatureFlow()
        setError("Document synchronization is delayed. Please try again shortly.")
        return false
    }

    suspend fun loadSignatureStepsForCurrentContext(
        eventId: String,
        getRequiredTeamSignLinks: suspend (
            teamId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        getRequiredSignLinks: suspend (
            eventId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        pollBoldSignOperation: suspend (operationId: String) -> Result<Unit>,
        startPolling: (suspend () -> Unit) -> Job,
        setError: (String) -> Unit,
        logError: (String, Throwable) -> Unit,
    ) {
        if (!registrationFlowCoordinator.hasSignatureContexts()) {
            clearPendingSignatureFlow()
            return
        }

        fetchRequiredSignatureStepsForCurrentContext(
            eventId = eventId,
            getRequiredTeamSignLinks = getRequiredTeamSignLinks,
            getRequiredSignLinks = getRequiredSignLinks,
        ).onFailure { throwable ->
            logError("Failed to load required signing documents.", throwable)
            setError("Unable to load required documents: ${throwable.userMessage("Unknown error")}")
        }.onSuccess { allSteps ->
            if (allSteps.isEmpty()) {
                advanceSigningContextOrComplete(
                    eventId = eventId,
                    getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                    getRequiredSignLinks = getRequiredSignLinks,
                    pollBoldSignOperation = pollBoldSignOperation,
                    startPolling = startPolling,
                    setError = setError,
                    logError = logError,
                )
                return@onSuccess
            }

            registrationFlowCoordinator.replacePendingSignatureSteps(allSteps)
            processNextSignatureStep(
                eventId = eventId,
                getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                getRequiredSignLinks = getRequiredSignLinks,
                pollBoldSignOperation = pollBoldSignOperation,
                startPolling = startPolling,
                setError = setError,
                logError = logError,
            )
        }
    }

    private suspend fun advanceSigningContextOrComplete(
        eventId: String,
        getRequiredTeamSignLinks: suspend (
            teamId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        getRequiredSignLinks: suspend (
            eventId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        pollBoldSignOperation: suspend (operationId: String) -> Result<Unit>,
        startPolling: (suspend () -> Unit) -> Job,
        setError: (String) -> Unit,
        logError: (String, Throwable) -> Unit,
    ) {
        registrationFlowCoordinator.clearPendingSignatureSteps()

        if (registrationFlowCoordinator.advanceSignatureContext()) {
            loadSignatureStepsForCurrentContext(
                eventId = eventId,
                getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                getRequiredSignLinks = getRequiredSignLinks,
                pollBoldSignOperation = pollBoldSignOperation,
                startPolling = startPolling,
                setError = setError,
                logError = logError,
            )
            return
        }

        val action = registrationFlowCoordinator.completePendingSignatureFlow()
        action?.invoke()
    }

    private suspend fun processNextSignatureStep(
        eventId: String,
        getRequiredTeamSignLinks: suspend (
            teamId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        getRequiredSignLinks: suspend (
            eventId: String,
            signerContext: SignerContext,
            childUserId: String?,
            childUserEmail: String?,
        ) -> Result<List<SignStep>>,
        pollBoldSignOperation: suspend (operationId: String) -> Result<Unit>,
        startPolling: (suspend () -> Unit) -> Job,
        setError: (String) -> Unit,
        logError: (String, Throwable) -> Unit,
    ) {
        registrationFlowCoordinator.clearPendingSignaturePollJob()

        val currentStepState = registrationFlowCoordinator.currentPendingSignatureStep()
        if (currentStepState == null) {
            advanceSigningContextOrComplete(
                eventId = eventId,
                getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                getRequiredSignLinks = getRequiredSignLinks,
                pollBoldSignOperation = pollBoldSignOperation,
                startPolling = startPolling,
                setError = setError,
                logError = logError,
            )
            return
        }
        val currentStep = currentStepState.step

        if (currentStep.isTextStep()) {
            registrationFlowCoordinator.showTextSignaturePrompt(
                TextSignaturePromptState(
                    step = currentStep,
                    currentStep = currentStepState.currentStep,
                    totalSteps = currentStepState.totalSteps,
                )
            )
            return
        }

        val signingUrl = trustedBoldSignSigningUrlOrNull(currentStep.resolvedSigningUrl())
        if (signingUrl == null) {
            clearPendingSignatureFlow()
            setError("A required document has an unavailable or invalid signing URL.")
            return
        }

        registrationFlowCoordinator.showWebSignaturePrompt(
            WebSignaturePromptState(
                step = currentStep,
                url = signingUrl,
                currentStep = currentStepState.currentStep,
                totalSteps = currentStepState.totalSteps,
            )
        )

        setError("Waiting for signature sync...")
        registrationFlowCoordinator.replacePendingSignaturePollJob(
            startPolling {
                if (
                    awaitSignatureStepClearance(
                        eventId = eventId,
                        step = currentStep,
                        getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                        getRequiredSignLinks = getRequiredSignLinks,
                        pollBoldSignOperation = pollBoldSignOperation,
                        setError = setError,
                        logError = logError,
                    )
                ) {
                    registrationFlowCoordinator.clearWebSignaturePrompt()
                    processNextSignatureStep(
                        eventId = eventId,
                        getRequiredTeamSignLinks = getRequiredTeamSignLinks,
                        getRequiredSignLinks = getRequiredSignLinks,
                        pollBoldSignOperation = pollBoldSignOperation,
                        startPolling = startPolling,
                        setError = setError,
                        logError = logError,
                    )
                }
            }
        )
    }
}
