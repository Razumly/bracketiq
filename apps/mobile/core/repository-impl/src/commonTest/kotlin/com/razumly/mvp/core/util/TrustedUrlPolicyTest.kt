package com.razumly.mvp.core.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TrustedUrlPolicyTest {
    @Test
    fun signing_urls_accept_only_expected_boldsign_https_routes() {
        assertEquals(
            "https://app.boldsign.com/sign/document-123?token=abc",
            trustedBoldSignSigningUrlOrNull("https://app.boldsign.com/sign/document-123?token=abc"),
        )
        assertEquals(
            "https://app.boldsign.com/document/sign/document-123",
            trustedBoldSignSigningUrlOrNull("https://app.boldsign.com/document/sign/document-123"),
        )

        listOf(
            "http://app.boldsign.com/sign/document-123",
            "https://app.boldsign.com/",
            "https://app.boldsign.com@evil.example/sign/document-123",
            "https://app.boldsign.com.evil.example/sign/document-123",
            "https://app.boldsign.com:443/sign/document-123",
            "intent://app.boldsign.com/sign/document-123#Intent;scheme=https;end",
            "file:///data/local/tmp/document.html",
            "javascript:alert(1)",
            "data:text/html,document",
        ).forEach { unsafeUrl ->
            assertNull(trustedBoldSignSigningUrlOrNull(unsafeUrl), unsafeUrl)
        }
    }

    @Test
    fun generic_external_urls_require_unambiguous_https() {
        assertEquals(
            "https://partner.example.com/register?event=123",
            trustedExternalHttpsUrlOrNull("https://partner.example.com/register?event=123"),
        )

        listOf(
            "http://partner.example.com/register",
            "https://user@partner.example.com/register",
            "https://partner.example.com:8443/register",
            "https://partner.example.com\\@evil.example/register",
            "intent://partner.example.com/#Intent;scheme=https;end",
            "file:///etc/passwd",
            "data:text/plain,hello",
            "javascript:alert(1)",
        ).forEach { unsafeUrl ->
            assertNull(trustedExternalHttpsUrlOrNull(unsafeUrl), unsafeUrl)
        }
    }

    @Test
    fun app_update_urls_are_bound_to_the_platform_store_record() {
        val androidUrl = "https://play.google.com/store/apps/details?id=com.razumly.mvp"
        val iosUrl = "https://apps.apple.com/us/app/bracketiq/id6746649739?pt=42"

        assertEquals(androidUrl, trustedAppUpdateUrlOrNull(androidUrl, AppUpdatePlatform.ANDROID))
        assertEquals(iosUrl, trustedAppUpdateUrlOrNull(iosUrl, AppUpdatePlatform.IOS))
        assertNull(trustedAppUpdateUrlOrNull(androidUrl, AppUpdatePlatform.IOS))
        assertNull(trustedAppUpdateUrlOrNull(iosUrl, AppUpdatePlatform.ANDROID))
        assertNull(
            trustedAppUpdateUrlOrNull(
                "https://play.google.com/store/apps/details?id=com.razumly.mvp.evil",
                AppUpdatePlatform.ANDROID,
            ),
        )
        assertNull(
            trustedAppUpdateUrlOrNull(
                "https://apps.apple.com.evil.example/us/app/bracketiq/id6746649739",
                AppUpdatePlatform.IOS,
            ),
        )
    }

    @Test
    fun directions_are_the_only_allowed_custom_schemes() {
        assertEquals(
            "geo:0,0?q=123%20Main%20St",
            trustedDirectionsUrlOrNull("geo:0,0?q=123%20Main%20St"),
        )
        assertEquals(
            "geo-navigation:///directions?destination=123%20Main%20St",
            trustedDirectionsUrlOrNull("geo-navigation:///directions?destination=123%20Main%20St"),
        )
        assertNull(trustedDirectionsUrlOrNull("intent://maps.example/#Intent;scheme=https;end"))
        assertNull(trustedDirectionsUrlOrNull("bracketiq://event/123"))
    }
}
