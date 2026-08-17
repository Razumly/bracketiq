package com.razumly.mvp.refundManager

import com.razumly.mvp.core.data.dataTypes.RefundApprovalOccurrencePreview
import com.razumly.mvp.core.data.dataTypes.RefundApprovalPaymentPreview
import com.razumly.mvp.core.data.dataTypes.RefundApprovalPreview
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RefundApprovalPreviewTest {

    @Test
    fun approval_confirmation_describes_the_exact_immutable_scope() {
        val preview = RefundApprovalPreview(
            paymentScope = listOf(
                RefundApprovalPaymentPreview(
                    paymentId = "payment_1",
                    billId = "bill_1",
                    refundableAmountCents = 1_010,
                ),
            ),
            paymentCount = 1,
            refundableAmountCents = 1_010,
            currency = "usd",
            occurrence = RefundApprovalOccurrencePreview(occurrenceDate = "2026-07-11"),
            policyDecision = "WITHIN_CANCELLATION_WINDOW",
            scopeVersion = 2,
            scopeHash = "immutable-scope",
            isValid = true,
        )

        assertTrue(preview.isApprovalTokenUsable())
        assertEquals("\$10.10", formatRefundApprovalAmount(1_010, "usd"))
        assertTrue(buildRefundApprovalConfirmationText(preview).contains("1 payment"))
        assertTrue(buildRefundApprovalConfirmationText(preview).contains("\$10.10"))
        assertTrue(buildRefundApprovalConfirmationText(preview).contains("2026-07-11"))
        assertTrue(buildRefundApprovalConfirmationText(preview).contains("WITHIN_CANCELLATION_WINDOW"))
    }

    @Test
    fun approval_requires_a_valid_preview_token_and_payment_scope() {
        val preview = RefundApprovalPreview(
            paymentCount = 1,
            refundableAmountCents = 500,
            scopeVersion = 2,
            scopeHash = "scope",
            isValid = true,
        )

        assertFalse(preview.isApprovalTokenUsable())
    }
}
