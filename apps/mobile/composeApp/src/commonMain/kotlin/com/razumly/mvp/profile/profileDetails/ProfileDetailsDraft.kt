package com.razumly.mvp.profile.profileDetails

import com.razumly.mvp.core.data.dataTypes.AuthAccount
import com.razumly.mvp.core.data.dataTypes.UserData

internal data class ProfileDetailsDraft(
    val userName: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val profileImageId: String? = null,
)

internal data class ProfileDetailsDraftState(
    val draft: ProfileDetailsDraft = ProfileDetailsDraft(),
    val baseline: ProfileDetailsDraft? = null,
    val ownerId: String? = null,
)

internal fun reconcileProfileDetailsDraft(
    state: ProfileDetailsDraftState,
    currentUser: UserData,
    currentAccount: AuthAccount,
): ProfileDetailsDraftState {
    val incomingOwnerId = currentUser.id.trim().takeIf(String::isNotBlank) ?: return state
    val incomingDraft = ProfileDetailsDraft(
        userName = currentUser.userName,
        firstName = currentUser.firstName,
        lastName = currentUser.lastName,
        email = currentAccount.email,
        profileImageId = currentUser.profileImageId?.trim()?.takeIf(String::isNotBlank),
    )
    val isNewOwner = state.ownerId != incomingOwnerId
    val isClean = state.baseline == null || state.draft == state.baseline

    return when {
        isNewOwner || isClean -> ProfileDetailsDraftState(
            draft = incomingDraft,
            baseline = incomingDraft,
            ownerId = incomingOwnerId,
        )

        // A successful save publishes the submitted profile through currentUser. Treat that
        // matching server snapshot as the new clean baseline without replacing any later edits.
        state.draft == incomingDraft -> state.copy(
            baseline = incomingDraft,
            ownerId = incomingOwnerId,
        )

        else -> state
    }
}
