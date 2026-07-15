package com.razumly.mvp.core.presentation.composables

import com.razumly.mvp.core.data.repositories.ChatTermsConsentState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TermsConsentDialogTest {
    @Test
    fun server_terms_path_uses_the_current_api_origin_and_server_version() {
        val presentation = termsAgreementPresentation(
            state = ChatTermsConsentState(
                version = "2026-06-10",
                url = "/terms",
            ),
            baseUrl = "https://bracket-iq.com/",
        )

        assertEquals("https://bracket-iq.com/terms", presentation.url)
        assertEquals("Terms and EULA version 2026-06-10", presentation.versionLabel)
    }

    @Test
    fun server_absolute_terms_url_is_used_without_replacing_it() {
        assertEquals(
            "https://legal.bracket-iq.com/terms/2026-07",
            resolveTermsAgreementUrl(
                rawUrl = "https://legal.bracket-iq.com/terms/2026-07",
                baseUrl = "https://bracket-iq.com",
            ),
        )
    }

    @Test
    fun unsafe_or_missing_server_url_is_not_opened_as_a_terms_link() {
        assertNull(resolveTermsAgreementUrl("javascript:alert(1)", "https://bracket-iq.com"))
        assertNull(resolveTermsAgreementUrl("//other.example/terms", "https://bracket-iq.com"))
        assertNull(resolveTermsAgreementUrl("", "https://bracket-iq.com"))
        assertNull(resolveTermsAgreementUrl("/terms", "bracket-iq.com"))
    }
}
