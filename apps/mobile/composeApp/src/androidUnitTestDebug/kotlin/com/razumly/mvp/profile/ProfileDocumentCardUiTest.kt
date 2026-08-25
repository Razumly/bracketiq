package com.razumly.mvp.profile

import android.app.Application
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.razumly.mvp.core.data.repositories.ProfileDocumentCard
import com.razumly.mvp.core.data.repositories.ProfileDocumentStatus
import com.razumly.mvp.core.data.repositories.ProfileDocumentType
import com.razumly.mvp.core.data.repositories.SignerContext
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], application = Application::class)
class ProfileDocumentCardUiTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun givenImportedDocument_whenCardRendered_thenDisplaysCustomerSafeProvenanceAndMetadata() {
        composeRule.setContent {
            MaterialTheme {
                DocumentCard(
                    document = ProfileDocumentCard(
                        id = "imported_1",
                        status = ProfileDocumentStatus.SIGNED,
                        organizationName = "City League",
                        templateId = "version_2",
                        title = "Imported Waiver",
                        type = ProfileDocumentType.PDF,
                        provenance = "IMPORTED",
                        documentRequirementTitle = "Waiver Requirement",
                        versionSequence = 2,
                        scopeType = "EVENT_PARTICIPATION",
                        requiredSignerType = "PARTICIPANT",
                        requiredSignerLabel = "Participant",
                        signerContext = SignerContext.PARTICIPANT,
                        signerContextLabel = "Participant",
                    ),
                    actionLabel = "View document",
                    isProcessing = false,
                    processingLabel = "Opening...",
                    onAction = {},
                )
            }
        }

        composeRule.onNodeWithText("Imported Waiver").assertIsDisplayed()
        composeRule.onNodeWithText("Provenance: Imported").assertIsDisplayed()
        composeRule.onNodeWithText("Document requirement: Waiver Requirement").assertIsDisplayed()
        composeRule.onNodeWithText("Version: 2").assertIsDisplayed()
        composeRule.onNodeWithText("Scope: Event participation").assertIsDisplayed()
        composeRule.onNodeWithText("Lifecycle: SIGNED").assertIsDisplayed()
        composeRule.onNodeWithText("Signing date unknown").assertIsDisplayed()
        composeRule.onNodeWithText("Type: PDF").assertIsDisplayed()
        composeRule.onNodeWithText("View document").fetchSemanticsNode()
    }
    @Test
    fun givenVoidedImportedDocument_whenCardRendered_thenKeepsHistoryAndPdfAction() {
        composeRule.setContent {
            MaterialTheme {
                DocumentCard(
                    document = ProfileDocumentCard(
                        id = "voided_1",
                        status = ProfileDocumentStatus.VOID,
                        organizationName = "City League",
                        templateId = "version_2",
                        title = "Voided waiver",
                        type = ProfileDocumentType.PDF,
                        provenance = "IMPORTED",
                        documentRequirementTitle = "Waiver Requirement",
                        versionSequence = 2,
                        scopeType = "EVENT_PARTICIPATION",
                        viewUrl = "/api/documents/signed/voided_1/file",
                        requiredSignerType = "PARTICIPANT",
                        requiredSignerLabel = "Participant",
                        signerContext = SignerContext.PARTICIPANT,
                        signerContextLabel = "Participant",
                    ),
                    actionLabel = "View document",
                    isProcessing = false,
                    processingLabel = "Opening...",
                    onAction = {},
                )
            }
        }

        composeRule.onNodeWithText("Voided waiver").assertIsDisplayed()
        composeRule.onNodeWithText("Provenance: Imported").assertIsDisplayed()
        composeRule.onNodeWithText("Lifecycle: VOID").assertIsDisplayed()
        composeRule.onNodeWithText("Signing date unknown").assertIsDisplayed()
        composeRule.onNodeWithText("View document").assertIsEnabled()
    }
}
