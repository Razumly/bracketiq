package com.razumly.mvp.eventDetail

import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext

internal fun buildSignatureContextQueue(
    baseContext: SignerContext,
    child: JoinChildOption?,
    currentAccountEmail: String?,
): List<SignerContext> {
    if (child == null) return listOf(baseContext)
    val childEmail = child.email.normalizedEmailForSignatureContext()
    val currentEmail = currentAccountEmail.normalizedEmailForSignatureContext()
    val shouldChainChild =
        childEmail != null && currentEmail != null && childEmail == currentEmail && baseContext != SignerContext.CHILD

    return if (shouldChainChild) {
        listOf(baseContext, SignerContext.CHILD)
    } else {
        listOf(baseContext)
    }
}

internal fun signatureContextAt(
    contexts: List<SignerContext>,
    index: Int,
): SignerContext = contexts.getOrNull(index) ?: SignerContext.PARTICIPANT

internal fun pendingSignatureStepsMatch(
    pendingStep: SignStep,
    candidateStep: SignStep,
): Boolean {
    if (pendingStep.templateId != candidateStep.templateId) {
        return false
    }
    val pendingDocumentId = pendingStep.resolvedDocumentId()
    val candidateDocumentId = candidateStep.resolvedDocumentId()
    return pendingDocumentId == null ||
        candidateDocumentId == null ||
        pendingDocumentId == candidateDocumentId
}

private fun String?.normalizedEmailForSignatureContext(): String? =
    this
        ?.trim()
        ?.takeIf(String::isNotBlank)
        ?.lowercase()
