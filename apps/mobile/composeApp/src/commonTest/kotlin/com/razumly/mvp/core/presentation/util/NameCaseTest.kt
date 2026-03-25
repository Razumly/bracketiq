package com.razumly.mvp.core.presentation.util

import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.Test
import kotlin.test.assertEquals

class NameCaseTest {

    @Test
    fun to_name_case_uppercases_each_name_part() {
        assertEquals("Sam Raz", "sam raz".toNameCase())
    }

    @Test
    fun to_name_case_preserves_existing_inner_capitalization() {
        assertEquals("Sam McDonald", "sam McDonald".toNameCase())
    }

    @Test
    fun user_data_full_name_uses_name_case() {
        val user = UserData(
            firstName = "sam",
            lastName = "McDonald",
            teamIds = emptyList(),
            friendIds = emptyList(),
            friendRequestIds = emptyList(),
            friendRequestSentIds = emptyList(),
            followingIds = emptyList(),
            userName = "sammy",
            hasStripeAccount = false,
            uploadedImages = emptyList(),
            profileImageId = null,
            id = "user_1",
        )

        assertEquals("Sam McDonald", user.fullName)
    }
}
