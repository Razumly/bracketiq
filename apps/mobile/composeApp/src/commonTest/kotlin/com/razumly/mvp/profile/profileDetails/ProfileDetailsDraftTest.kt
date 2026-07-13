package com.razumly.mvp.profile.profileDetails

import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.UserData
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProfileDetailsDraftTest {

    @Test
    fun given_initial_profile_when_reconciled_then_hydrates_draft_and_baseline() {
        val actual = reconcileProfileDetailsDraft(
            state = ProfileDetailsDraftState(),
            currentUser = user(),
            currentAccount = account(),
        )

        val expected = ProfileDetailsDraft(
            userName = "sam",
            firstName = "Samuel",
            lastName = "Razumovskiy",
            email = "samuel@example.test",
            profileImageId = "image_1",
        )
        assertEquals(expected, actual.draft)
        assertEquals(expected, actual.baseline)
        assertEquals("user_1", actual.ownerId)
    }

    @Test
    fun given_dirty_draft_when_user_and_account_refresh_then_preserves_unsaved_edits() {
        val initial = reconcileProfileDetailsDraft(
            state = ProfileDetailsDraftState(),
            currentUser = user(),
            currentAccount = account(),
        )
        val dirty = initial.copy(
            draft = initial.draft.copy(
                userName = "sam-edited",
                firstName = "Sammy",
                profileImageId = "image_draft",
            ),
        )

        val actual = reconcileProfileDetailsDraft(
            state = dirty,
            currentUser = user().copy(uploadedImages = listOf("image_1", "image_2")),
            currentAccount = account().copy(name = "Refreshed account"),
        )

        assertEquals(dirty.draft, actual.draft)
        assertEquals(initial.baseline, actual.baseline)
        assertEquals("user_1", actual.ownerId)
    }

    @Test
    fun given_deleted_selected_image_when_user_refreshes_then_keeps_other_unsaved_fields() {
        val initial = reconcileProfileDetailsDraft(
            state = ProfileDetailsDraftState(),
            currentUser = user(),
            currentAccount = account(),
        )
        val afterDeletion = initial.copy(
            draft = initial.draft.copy(
                firstName = "Edited before deletion",
                profileImageId = null,
            ),
        )

        val actual = reconcileProfileDetailsDraft(
            state = afterDeletion,
            currentUser = user().copy(uploadedImages = emptyList()),
            currentAccount = account(),
        )

        assertEquals("Edited before deletion", actual.draft.firstName)
        assertEquals(null, actual.draft.profileImageId)
        assertEquals(afterDeletion.baseline, actual.baseline)
    }

    @Test
    fun given_different_signed_in_user_when_dirty_draft_refreshes_then_resets_to_new_owner() {
        val initial = reconcileProfileDetailsDraft(
            state = ProfileDetailsDraftState(),
            currentUser = user(),
            currentAccount = account(),
        )
        val dirty = initial.copy(draft = initial.draft.copy(firstName = "Unsaved Samuel"))

        val actual = reconcileProfileDetailsDraft(
            state = dirty,
            currentUser = user(
                id = "user_2",
                userName = "alex",
                firstName = "Alex",
                lastName = "Rivera",
                profileImageId = "image_2",
            ),
            currentAccount = account(id = "user_2", email = "alex@example.test"),
        )

        val expected = ProfileDetailsDraft(
            userName = "alex",
            firstName = "Alex",
            lastName = "Rivera",
            email = "alex@example.test",
            profileImageId = "image_2",
        )
        assertEquals(expected, actual.draft)
        assertEquals(expected, actual.baseline)
        assertEquals("user_2", actual.ownerId)
    }

    @Test
    fun given_saved_draft_when_matching_profile_refreshes_then_marks_draft_clean() {
        val initial = reconcileProfileDetailsDraft(
            state = ProfileDetailsDraftState(),
            currentUser = user(),
            currentAccount = account(),
        )
        val submittedDraft = initial.draft.copy(firstName = "Sammy", profileImageId = "image_2")

        val actual = reconcileProfileDetailsDraft(
            state = initial.copy(draft = submittedDraft),
            currentUser = user(firstName = "Sammy", profileImageId = "image_2"),
            currentAccount = account(),
        )

        assertEquals(submittedDraft, actual.draft)
        assertEquals(submittedDraft, actual.baseline)
    }

    @Test
    fun given_empty_or_whitespace_username_when_other_profile_fields_are_valid_then_save_is_disabled() {
        listOf("", "  \t\n  ").forEach { userName ->
            val validation = validateProfileDetailsForm(
                draft = validDraft(userName = userName),
                currentPassword = "",
                newPassword = "",
                confirmNewPassword = "",
            )

            assertFalse(validation.isUserNameValid)
            assertFalse(validation.canSave)
            assertEquals(null, validation.normalizedUserName)
        }
    }

    @Test
    fun given_username_with_outer_whitespace_when_other_profile_fields_are_valid_then_it_is_trimmed_and_save_is_enabled() {
        val validation = validateProfileDetailsForm(
            draft = validDraft(userName = "  sam-edited  "),
            currentPassword = "",
            newPassword = "",
            confirmNewPassword = "",
        )

        assertTrue(validation.isUserNameValid)
        assertTrue(validation.canSave)
        assertEquals("sam-edited", validation.normalizedUserName)
    }

    private fun validDraft(userName: String): ProfileDetailsDraft = ProfileDetailsDraft(
        userName = userName,
        firstName = "Samuel",
        lastName = "Razumovskiy",
        email = "samuel@example.test",
        profileImageId = "image_1",
    )

    private fun user(
        id: String = "user_1",
        userName: String = "sam",
        firstName: String = "Samuel",
        lastName: String = "Razumovskiy",
        profileImageId: String? = "image_1",
    ): UserData = UserData().copy(
        id = id,
        userName = userName,
        firstName = firstName,
        lastName = lastName,
        profileImageId = profileImageId,
        uploadedImages = listOfNotNull(profileImageId),
    )

    private fun account(
        id: String = "user_1",
        email: String = "samuel@example.test",
    ): AuthAccount = AuthAccount(id = id, email = email)
}
