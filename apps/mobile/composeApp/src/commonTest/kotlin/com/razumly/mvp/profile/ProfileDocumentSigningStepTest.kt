package com.razumly.mvp.profile

import com.razumly.mvp.core.data.repositories.SignStep
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ProfileDocumentSigningStepTest {

    @Test
    fun requested_template_selects_its_exact_step_even_when_another_step_is_first() {
        val requested = SignStep(templateId = "requested-template", type = "PDF")

        val result = selectProfileDocumentSigningStep(
            requestedTemplateId = "requested-template",
            steps = listOf(
                SignStep(templateId = "different-template", type = "TEXT"),
                requested,
            ),
        )

        assertEquals(requested, result)
    }

    @Test
    fun missing_requested_template_does_not_fall_back_to_another_step() {
        val result = selectProfileDocumentSigningStep(
            requestedTemplateId = "requested-template",
            steps = listOf(SignStep(templateId = "different-template", type = "PDF")),
        )

        assertNull(result)
    }

    @Test
    fun duplicate_requested_template_fails_closed() {
        val result = selectProfileDocumentSigningStep(
            requestedTemplateId = "requested-template",
            steps = listOf(
                SignStep(templateId = "requested-template", documentId = "document-one"),
                SignStep(templateId = "requested-template", documentId = "document-two"),
            ),
        )

        assertNull(result)
    }

    @Test
    fun blank_requested_template_fails_closed() {
        val result = selectProfileDocumentSigningStep(
            requestedTemplateId = "  ",
            steps = listOf(SignStep(templateId = "template")),
        )

        assertNull(result)
    }
}
