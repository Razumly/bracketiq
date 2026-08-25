package com.razumly.mvp.core.notifications

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DocumentNotificationNavigationTest {
    @Test
    fun givenImportNotification_whenPayloadContainsEvidenceId_thenMapsDocumentTarget() {
        assertEquals(
            "evidence_1",
            mapOf(
                "notificationType" to "documents",
                "action" to "IMPORT",
                "evidenceId" to "evidence_1",
            ).documentNotificationEvidenceId(),
        )
    }

    @Test
    fun givenVoidNotification_whenPayloadKeysUseDifferentCase_thenMapsDocumentTarget() {
        assertEquals(
            "evidence_1",
            mapOf(
                "NotificationType" to "DOCUMENTS",
                "Action" to "VOID",
                "EvidenceId" to "evidence_1",
            ).documentNotificationEvidenceId(),
        )
    }

    @Test
    fun givenUnrelatedNotification_whenEvidenceIdIsPresent_thenDoesNotNavigate() {
        assertNull(
            mapOf(
                "notificationType" to "invitations",
                "evidenceId" to "evidence_1",
            ).documentNotificationEvidenceId(),
        )
    }

    @Test
    fun givenPrivateFields_whenDocumentNotificationIsMapped_thenOnlyTargetIdentityIsReturned() {
        val target = mapOf(
            "notificationType" to "documents",
            "action" to "VOID",
            "evidenceId" to "evidence_1",
            "sourceNote" to "private note",
            "attestationText" to "private attestation",
            "uploaderId" to "private uploader",
            "contentHash" to "private hash",
            "auditTrail" to "private audit",
        ).documentNotificationEvidenceId()

        assertEquals("evidence_1", target)
    }

    @Test
    fun givenUnsafeEvidenceId_whenPayloadIsMapped_thenDoesNotNavigate() {
        assertNull(
            mapOf(
                "notificationType" to "documents",
                "evidenceId" to "../private-document",
            ).documentNotificationEvidenceId(),
        )
    }

    @Test
    fun givenDocumentDeepLinkPath_whenPathIsCustomerSafe_thenReturnsDocumentId() {
        assertEquals(
            "evidence_1",
            documentIdFromDeepLinkPath("profile/documents/evidence_1"),
        )
    }

    @Test
    fun givenDocumentDeepLinkPath_whenPathIsNotDocumentRoute_thenDoesNotReturnDocumentId() {
        assertNull(documentIdFromDeepLinkPath("profile/invites/evidence_1"))
        assertNull(documentIdFromDeepLinkPath("profile/documents/../private-document"))
    }
}
