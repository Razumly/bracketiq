package com.razumly.mvp.profile

import com.razumly.mvp.core.data.repositories.ProfileDocumentCard
import com.razumly.mvp.core.data.repositories.ProfileDocumentStatus
import com.razumly.mvp.core.data.repositories.ProfileDocumentType
import com.razumly.mvp.core.data.repositories.ProfileDocumentsBundle
import com.razumly.mvp.core.data.repositories.SignerContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ProfileDocumentNotificationNavigationTest {
    @Test
    fun givenAuthorizedDocument_whenTargetIsListed_thenReturnsTheListedDocument() {
        val document = document("evidence_1")

        assertEquals(
            document,
            findProfileDocumentById(
                "evidence_1",
                ProfileDocumentsBundle(signed = listOf(document)),
            ),
        )
    }

    @Test
    fun givenMissingOrUnauthorizedDocument_whenTargetIsResolved_thenReturnsNoDocument() {
        val documents = ProfileDocumentsBundle(signed = listOf(document("other_evidence")))

        assertNull(findProfileDocumentById("evidence_1", documents))
        assertNull(findProfileDocumentById("", documents))
    }

    private fun document(id: String): ProfileDocumentCard = ProfileDocumentCard(
        id = id,
        status = ProfileDocumentStatus.SIGNED,
        organizationName = "City League",
        templateId = "version_1",
        title = "Waiver",
        type = ProfileDocumentType.PDF,
        provenance = "IMPORTED",
        requiredSignerType = "PARTICIPANT",
        requiredSignerLabel = "Participant",
        signerContext = SignerContext.PARTICIPANT,
        signerContextLabel = "Participant",
        viewUrl = "/api/documents/signed/$id/file",
    )
}
