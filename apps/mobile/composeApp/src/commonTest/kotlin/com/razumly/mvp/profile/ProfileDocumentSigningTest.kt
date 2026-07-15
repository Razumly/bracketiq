package com.razumly.mvp.profile

import com.razumly.mvp.core.data.repositories.SignStep
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ProfileDocumentSigningTest {
    private val waiver = SignStep(templateId = "waiver", title = "Waiver")
    private val consent = SignStep(templateId = "consent", title = "Consent")

    @Test
    fun missingRequestedTemplate_never_falls_back_to_the_first_signing_step() {
        val matches = matchingSignStepsForTemplate(listOf(waiver, consent), "unknown")

        assertTrue(matches.isEmpty())
    }

    @Test
    fun matchingRequestedTemplate_uses_exact_trimmed_template_id_only() {
        val matches = matchingSignStepsForTemplate(listOf(waiver, consent), " consent ")

        assertEquals(listOf(consent), matches)
    }

    @Test
    fun duplicateRequestedTemplate_remains_ambiguous_instead_of_selecting_one() {
        val duplicateConsent = consent.copy(title = "Second consent")

        assertEquals(
            listOf(consent, duplicateConsent),
            matchingSignStepsForTemplate(listOf(waiver, consent, duplicateConsent), "consent"),
        )
    }
}
