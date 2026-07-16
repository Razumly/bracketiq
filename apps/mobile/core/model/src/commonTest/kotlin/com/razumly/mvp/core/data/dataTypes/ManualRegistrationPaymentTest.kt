package com.razumly.mvp.core.data.dataTypes

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ManualRegistrationPaymentTest {
    @Test
    fun cashAppInput_keepsDollarPrefix() {
        assertEquals("\$", formatManualPaymentProviderInput(MANUAL_PAYMENT_PROVIDER_CASH_APP, ""))
        assertEquals("\$camka14", formatManualPaymentProviderInput(MANUAL_PAYMENT_PROVIDER_CASH_APP, "camka14"))
        assertEquals("\$camka14", formatManualPaymentProviderInput(MANUAL_PAYMENT_PROVIDER_CASH_APP, "@camka14"))
        assertEquals("\$camka14", formatManualPaymentProviderInput(MANUAL_PAYMENT_PROVIDER_CASH_APP, "\$cam\$ka14"))
    }

    @Test
    fun venmoInput_keepsAtPrefix() {
        assertEquals("@", formatManualPaymentProviderInput(MANUAL_PAYMENT_PROVIDER_VENMO, ""))
        assertEquals("@camka14", formatManualPaymentProviderInput(MANUAL_PAYMENT_PROVIDER_VENMO, "camka14"))
        assertEquals("@camka14", formatManualPaymentProviderInput(MANUAL_PAYMENT_PROVIDER_VENMO, "\$camka14"))
    }

    @Test
    fun storedProviderUrls_arePresentedAsPrefixedUsernames() {
        assertEquals(
            "\$camka14",
            formatManualPaymentProviderInput(
                MANUAL_PAYMENT_PROVIDER_CASH_APP,
                "https://cash.app/\$camka14",
            ),
        )
        assertEquals(
            "@camka14",
            formatManualPaymentProviderInput(
                MANUAL_PAYMENT_PROVIDER_VENMO,
                "https://venmo.com/u/camka14",
            ),
        )
    }

    @Test
    fun prefixedUsernames_normalizeToBackendUrls() {
        assertEquals(
            "https://cash.app/\$camka14",
            normalizeManualPaymentUrl(MANUAL_PAYMENT_PROVIDER_CASH_APP, "\$camka14"),
        )
        assertEquals(
            "https://venmo.com/u/camka14",
            normalizeManualPaymentUrl(MANUAL_PAYMENT_PROVIDER_VENMO, "@camka14"),
        )
        assertNull(normalizeManualPaymentUrl(MANUAL_PAYMENT_PROVIDER_CASH_APP, "\$"))
        assertNull(normalizeManualPaymentUrl(MANUAL_PAYMENT_PROVIDER_VENMO, "@"))
    }
}
