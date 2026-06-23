package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class EventSignatureExecutionCoordinatorTest {
    @Test
    fun text_signature_confirmation_records_signature_and_completes_flow_after_sync() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventSignatureExecutionCoordinator(
            registrationFlowCoordinator = registrationFlow,
            pollIntervalMillis = 0,
            pollTimeoutMillis = 0,
        )
        val events = mutableListOf<String>()
        var fetchCount = 0

        coordinator.runActionAfterRequiredSigning(
            eventId = "event-1",
            signerContext = SignerContext.PARTICIPANT,
            child = null,
            currentAccountEmail = "player@example.com",
            teamId = null,
            onReady = { events += "ready" },
            getRequiredTeamSignLinks = { _, _, _, _ -> error("Team links should not be loaded") },
            getRequiredSignLinks = { eventId, context, childUserId, childUserEmail ->
                events += "fetch:$eventId:$context:$childUserId:$childUserEmail"
                fetchCount += 1
                Result.success(
                    if (fetchCount == 1) {
                        listOf(textStep())
                    } else {
                        emptyList()
                    }
                )
            },
            pollBoldSignOperation = { operationId ->
                events += "poll:$operationId"
                Result.success(Unit)
            },
            startPolling = { error("Polling should not start for text step") },
            setError = { message -> events += "error:$message" },
            logError = { message, throwable -> events += "log:$message:${throwable.message}" },
        )

        assertEquals("text-template", registrationFlow.textSignaturePrompt.value?.step?.templateId)

        coordinator.confirmTextSignature(
            eventId = "event-1",
            recordTeamSignature = { _, _, _, _, _, _ -> error("Team signature should not be recorded") },
            recordSignature = { eventId, templateId, documentId, type ->
                events += "record:$eventId:$templateId:$documentId:$type"
                Result.success(Unit)
            },
            getRequiredTeamSignLinks = { _, _, _, _ -> error("Team links should not be loaded") },
            getRequiredSignLinks = { eventId, context, childUserId, childUserEmail ->
                events += "fetch:$eventId:$context:$childUserId:$childUserEmail"
                Result.success(emptyList())
            },
            pollBoldSignOperation = { operationId ->
                events += "poll:$operationId"
                Result.success(Unit)
            },
            startPolling = { error("Polling should not start after cleared text step") },
            showLoading = { message -> events += "show:$message" },
            hideLoading = { events += "hide" },
            setError = { message -> events += "error:$message" },
            logError = { message, throwable -> events += "log:$message:${throwable.message}" },
            nowMillis = { 1234L },
        )

        assertNull(registrationFlow.textSignaturePrompt.value)
        assertEquals(
            listOf(
                "fetch:event-1:PARTICIPANT:null:null",
                "show:Recording signature ...",
                "record:event-1:text-template:doc-1:TEXT",
                "error:Waiting for signature sync...",
                "fetch:event-1:PARTICIPANT:null:null",
                "ready",
                "hide",
            ),
            events,
        )
    }

    @Test
    fun web_signature_step_starts_poll_job_and_completes_when_step_clears() = runTest {
        val registrationFlow = EventRegistrationFlowCoordinator()
        val coordinator = EventSignatureExecutionCoordinator(
            registrationFlowCoordinator = registrationFlow,
            pollIntervalMillis = 0,
            pollTimeoutMillis = 0,
        )
        val events = mutableListOf<String>()
        var fetchCount = 0
        var pollBlock: (suspend () -> Unit)? = null

        coordinator.runActionAfterRequiredSigning(
            eventId = "event-1",
            signerContext = SignerContext.PARTICIPANT,
            child = null,
            currentAccountEmail = null,
            teamId = null,
            onReady = { events += "ready" },
            getRequiredTeamSignLinks = { _, _, _, _ -> error("Team links should not be loaded") },
            getRequiredSignLinks = { eventId, context, _, _ ->
                fetchCount += 1
                events += "fetch:$eventId:$context:$fetchCount"
                Result.success(
                    if (fetchCount == 1) {
                        listOf(webStep())
                    } else {
                        emptyList()
                    }
                )
            },
            pollBoldSignOperation = { operationId ->
                events += "poll:$operationId"
                Result.success(Unit)
            },
            startPolling = { block ->
                events += "start-poll"
                pollBlock = block
                Job()
            },
            setError = { message -> events += "error:$message" },
            logError = { message, throwable -> events += "log:$message:${throwable.message}" },
        )

        assertEquals("https://sign.example/doc", registrationFlow.webSignaturePrompt.value?.url)
        val poll = assertNotNull(pollBlock)

        poll.invoke()

        assertNull(registrationFlow.webSignaturePrompt.value)
        assertEquals(
            listOf(
                "fetch:event-1:PARTICIPANT:1",
                "error:Waiting for signature sync...",
                "start-poll",
                "error:Waiting for signature sync...",
                "poll:operation-1",
                "error:Waiting for signature sync...",
                "fetch:event-1:PARTICIPANT:2",
                "ready",
            ),
            events,
        )
    }

    private fun textStep(): SignStep {
        return SignStep(
            templateId = "text-template",
            type = "TEXT",
            documentId = "doc-1",
        )
    }

    private fun webStep(): SignStep {
        return SignStep(
            templateId = "web-template",
            type = "PDF",
            signingUrl = "https://sign.example/doc",
            documentId = "doc-1",
            operationId = "operation-1",
        )
    }
}
