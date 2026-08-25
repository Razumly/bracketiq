package com.razumly.mvp.profile

import com.razumly.mvp.core.data.repositories.ProfileDocumentCard
import com.razumly.mvp.core.data.repositories.ProfileDocumentStatus
import com.razumly.mvp.core.data.repositories.ProfileDocumentType
import com.razumly.mvp.core.data.repositories.SignStep
import com.razumly.mvp.core.data.repositories.SignerContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ProfileDocumentSigningTest {
    private val waiver = SignStep(templateId = "waiver", title = "Waiver")
    private val consent = SignStep(templateId = "consent", title = "Consent")

    @Test
    fun givenMissingRequestedTemplate_whenMatchingSigningSteps_thenDoesNotFallBackToFirstStep() {
        val matches = matchingSignStepsForTemplate(listOf(waiver, consent), "unknown")

        assertTrue(matches.isEmpty())
    }

    @Test
    fun givenMatchingRequestedTemplate_whenMatchingSigningSteps_thenUsesExactTrimmedTemplateId() {
        val matches = matchingSignStepsForTemplate(listOf(waiver, consent), " consent ")

        assertEquals(listOf(consent), matches)
    }

    @Test
    fun givenDuplicateRequestedTemplate_whenMatchingSigningSteps_thenKeepsAmbiguousMatches() {
        val duplicateConsent = consent.copy(title = "Second consent")

        assertEquals(
            listOf(consent, duplicateConsent),
            matchingSignStepsForTemplate(listOf(waiver, consent, duplicateConsent), "consent"),
        )
    }

    @Test
    fun givenImportedDocumentWithoutHistoricalDate_whenSigningLabelRequested_thenDoesNotUseProviderDate() {
        val document = importedDocument(signedAt = "2026-02-15T12:30:00.000Z")

        assertEquals("Signing date unknown", profileDocumentSigningLabel(document))
    }

    @Test
    fun givenImportedDocumentWithHistoricalDate_whenSigningLabelRequested_thenUsesHistoricalDate() {
        val document = importedDocument(historicalSigningDate = "2024-06-18T00:00:00.000Z")

        assertEquals("Signing date: 2024-06-18", profileDocumentSigningLabel(document))
    }

    @Test
    fun givenVoidedDocument_whenFilteringHistory_thenRemainsInHistoryAndLeavesActiveCompletion() {
        val active = importedDocument()
        val voided = active.copy(id = "imported_voided", status = ProfileDocumentStatus.VOID)

        assertEquals(listOf(active), activeProfileDocuments(listOf(active, voided)))
        assertEquals(listOf(voided), voidedProfileDocuments(listOf(active, voided)))
    }

    private fun importedDocument(
        historicalSigningDate: String? = null,
        signedAt: String? = null,
    ): ProfileDocumentCard =
        ProfileDocumentCard(
            id = "imported_1",
            status = ProfileDocumentStatus.SIGNED,
            organizationName = "City League",
            templateId = "version_1",
            title = "Historical waiver",
            type = ProfileDocumentType.PDF,
            provenance = "IMPORTED",
            historicalSigningDate = historicalSigningDate,
            requiredSignerType = "PARTICIPANT",
            requiredSignerLabel = "Participant",
            signerContext = SignerContext.PARTICIPANT,
            signerContextLabel = "Participant",
            signedAt = signedAt,
        )
}
