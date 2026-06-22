package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EventSignatureFlowHelpersTest {

    @Test
    fun signature_context_queue_returns_base_context_without_child() {
        assertEquals(
            listOf(SignerContext.PARTICIPANT),
            buildSignatureContextQueue(
                baseContext = SignerContext.PARTICIPANT,
                child = null,
                currentAccountEmail = "parent@example.com",
            ),
        )
    }

    @Test
    fun signature_context_queue_chains_child_context_when_child_uses_current_account_email() {
        assertEquals(
            listOf(SignerContext.PARENT_GUARDIAN, SignerContext.CHILD),
            buildSignatureContextQueue(
                baseContext = SignerContext.PARENT_GUARDIAN,
                child = child(email = " Child@Example.com "),
                currentAccountEmail = "child@example.com",
            ),
        )
    }

    @Test
    fun signature_context_queue_does_not_duplicate_child_context() {
        assertEquals(
            listOf(SignerContext.CHILD),
            buildSignatureContextQueue(
                baseContext = SignerContext.CHILD,
                child = child(email = "child@example.com"),
                currentAccountEmail = "child@example.com",
            ),
        )
    }

    @Test
    fun signature_context_queue_requires_matching_child_and_account_emails() {
        assertEquals(
            listOf(SignerContext.PARENT_GUARDIAN),
            buildSignatureContextQueue(
                baseContext = SignerContext.PARENT_GUARDIAN,
                child = child(email = "child@example.com"),
                currentAccountEmail = "parent@example.com",
            ),
        )
        assertEquals(
            listOf(SignerContext.PARENT_GUARDIAN),
            buildSignatureContextQueue(
                baseContext = SignerContext.PARENT_GUARDIAN,
                child = child(email = null),
                currentAccountEmail = "parent@example.com",
            ),
        )
    }

    @Test
    fun signature_context_at_falls_back_to_participant_when_index_is_missing() {
        assertEquals(
            SignerContext.CHILD,
            signatureContextAt(listOf(SignerContext.PARENT_GUARDIAN, SignerContext.CHILD), 1),
        )
        assertEquals(
            SignerContext.PARTICIPANT,
            signatureContextAt(listOf(SignerContext.PARENT_GUARDIAN), 9),
        )
    }

    @Test
    fun pending_signature_steps_match_by_template_and_document_id() {
        val pending = step(templateId = "waiver", documentId = "doc-1")

        assertTrue(
            pendingSignatureStepsMatch(
                pendingStep = pending,
                candidateStep = step(templateId = "waiver", documentId = "doc-1"),
            ),
        )
        assertTrue(
            pendingSignatureStepsMatch(
                pendingStep = pending.copy(documentId = null),
                candidateStep = step(templateId = "waiver", documentId = "doc-2"),
            ),
        )
        assertTrue(
            pendingSignatureStepsMatch(
                pendingStep = pending,
                candidateStep = step(templateId = "waiver", documentId = null),
            ),
        )
        assertFalse(
            pendingSignatureStepsMatch(
                pendingStep = pending,
                candidateStep = step(templateId = "waiver", documentId = "doc-2"),
            ),
        )
        assertFalse(
            pendingSignatureStepsMatch(
                pendingStep = pending,
                candidateStep = step(templateId = "release", documentId = "doc-1"),
            ),
        )
    }

    @Test
    fun pending_signature_steps_match_uses_legacy_document_id() {
        assertTrue(
            pendingSignatureStepsMatch(
                pendingStep = step(templateId = "waiver", legacyDocumentId = "legacy-doc"),
                candidateStep = step(templateId = "waiver", documentId = "legacy-doc"),
            ),
        )
    }

    private fun child(email: String?): JoinChildOption {
        return JoinChildOption(
            userId = "child-1",
            fullName = "Child User",
            email = email,
            hasEmail = !email.isNullOrBlank(),
        )
    }

    private fun step(
        templateId: String,
        documentId: String? = null,
        legacyDocumentId: String? = null,
    ): SignStep {
        return SignStep(
            templateId = templateId,
            documentId = documentId,
            legacyDocumentId = legacyDocumentId,
        )
    }
}
