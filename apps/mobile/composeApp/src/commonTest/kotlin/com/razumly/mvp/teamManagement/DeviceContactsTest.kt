package com.razumly.mvp.teamManagement

import kotlin.test.Test
import kotlin.test.assertEquals

class DeviceContactsTest {
    @Test
    fun normalizeDeviceContacts_trimsDeduplicatesAndSorts() {
        val normalized = normalizeDeviceContacts(
            listOf(
                DeviceContact(
                    id = "2",
                    displayName = "  Zoe Player ",
                    emails = listOf(" ZOE@example.com ", "zoe@example.com"),
                    phones = listOf("(503) 555-0142", "5035550142"),
                ),
                DeviceContact(
                    id = "1",
                    firstName = " Alex ",
                    lastName = " Coach ",
                    emails = listOf("alex@example.com"),
                ),
            ),
        )

        assertEquals(listOf("1", "2"), normalized.map(DeviceContact::id))
        assertEquals(listOf("ZOE@example.com"), normalized[1].emails)
        assertEquals(listOf("(503) 555-0142"), normalized[1].phones)
    }

    @Test
    fun filterDeviceContacts_searchesNamesEmailsAndPhonesAndHonorsLimit() {
        val contacts = listOf(
            DeviceContact(id = "1", displayName = "Taylor Player", emails = listOf("taylor@example.com")),
            DeviceContact(id = "2", displayName = "Morgan Coach", phones = listOf("(971) 555-0123")),
            DeviceContact(id = "3", displayName = "Jordan Manager"),
        )

        assertEquals(listOf("1"), filterDeviceContacts(contacts, "example.com").map(DeviceContact::id))
        assertEquals(listOf("2"), filterDeviceContacts(contacts, "555-0123").map(DeviceContact::id))
        assertEquals(listOf("1"), filterDeviceContacts(contacts, "", limit = 1).map(DeviceContact::id))
    }

    @Test
    fun selectedContact_prefillsNamesAndStoresNorthAmericanDigitsForVisualFormatting() {
        val invite = SelectedDeviceContact(
            contactId = "contact-1",
            firstName = "",
            lastName = "",
            displayName = "Taylor Player",
            email = " TAYLOR@example.com ",
            phone = "+1 503 555 0142",
        ).toTeamBuilderPersonInvite()

        assertEquals("Taylor", invite.firstName)
        assertEquals("Player", invite.lastName)
        assertEquals("taylor@example.com", invite.email)
        assertEquals("5035550142", invite.phone)
    }

    @Test
    fun selectedContact_preservesInternationalPhoneForReview() {
        val invite = SelectedDeviceContact(
            contactId = "contact-2",
            firstName = "Avery",
            lastName = "Player",
            displayName = "Avery Player",
            email = null,
            phone = "+44 20 7946 0958",
        ).toTeamBuilderPersonInvite()

        assertEquals("+44 20 7946 0958", invite.phone)
    }
}
