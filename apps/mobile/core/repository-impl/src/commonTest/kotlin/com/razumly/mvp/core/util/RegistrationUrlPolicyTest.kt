package com.razumly.mvp.core.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RegistrationUrlPolicyTest {
    @Test
    fun given_registration_destination_when_opening_then_http_and_https_are_preserved() {
        for (url in listOf("http://organizer.example/join", "https://organizer.example:8443/join?event=1#register")) {
            assertEquals(url, registrationUrlOrNull(" $url "))
        }
        assertNull(trustedExternalHttpsUrlOrNull("http://organizer.example/join"))
    }

    @Test
    fun given_non_web_destination_when_opening_registration_then_it_is_rejected() {
        assertNull(registrationUrlOrNull("https://user:pass@organizer.example/register"))
        assertNull(registrationUrlOrNull("https://:443/register"))
        assertNull(registrationUrlOrNull("https://organizer.example/" + "a".repeat(2048)))
        for (url in listOf("javascript:alert(1)", "intent://join", "file:///join", "https://", "https://organizer.example\\@evil.example", "https://organizer.example/a\nb")) {
            assertNull(registrationUrlOrNull(url), url)
        }
    }
}
