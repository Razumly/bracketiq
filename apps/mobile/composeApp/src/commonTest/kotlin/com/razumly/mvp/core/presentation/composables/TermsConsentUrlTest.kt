package com.razumly.mvp.core.presentation.composables

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TermsConsentUrlTest {
    @Test
    fun resolves_only_the_canonical_terms_endpoint() {
        assertEquals("https://bracket-iq.com/terms", resolveCanonicalTermsUrl("/terms"))
        assertEquals(
            "https://bracket-iq.com/terms?version=2026-06-10",
            resolveCanonicalTermsUrl("https://bracket-iq.com/terms?version=2026-06-10"),
        )
        assertEquals("https://bracket-iq.com/terms", resolveCanonicalTermsUrl("HTTPS://BRACKET-IQ.COM/terms"))
    }

    @Test
    fun rejects_missing_and_noncanonical_terms_urls_without_fallback() {
        assertNull(resolveCanonicalTermsUrl(null))
        assertNull(resolveCanonicalTermsUrl(""))
        assertNull(resolveCanonicalTermsUrl("https://www.bracket-iq.com/terms"))
        assertNull(resolveCanonicalTermsUrl("https://bracket-iq.com.evil.example/terms"))
        assertNull(resolveCanonicalTermsUrl("/terms/other"))
        assertNull(resolveCanonicalTermsUrl("/privacy"))
        assertNull(resolveCanonicalTermsUrl("javascript:alert(1)"))
    }
}
