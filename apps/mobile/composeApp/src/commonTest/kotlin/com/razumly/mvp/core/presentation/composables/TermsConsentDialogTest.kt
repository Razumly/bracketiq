package com.razumly.mvp.core.presentation.composables

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TermsConsentDialogTest {
    @Test
    fun server_terms_path_uses_the_canonical_origin() {
        assertEquals("https://bracket-iq.com/terms", resolveCanonicalTermsUrl("/terms"))
    }

    @Test
    fun canonical_absolute_terms_url_is_used_without_replacing_it() {
        assertEquals("https://bracket-iq.com/terms?version=2026-07", resolveCanonicalTermsUrl(
            "https://bracket-iq.com/terms?version=2026-07",
        ))
    }

    @Test
    fun unsafe_or_missing_server_url_is_not_opened_as_a_terms_link() {
        assertNull(resolveCanonicalTermsUrl("javascript:alert(1)"))
        assertNull(resolveCanonicalTermsUrl("//other.example/terms"))
        assertNull(resolveCanonicalTermsUrl("https://legal.bracket-iq.com/terms/2026-07"))
        assertNull(resolveCanonicalTermsUrl(""))
    }
}
