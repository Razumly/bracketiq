package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.userAuth.util.getGoogleUserInfo
import io.appwrite.ID
import io.appwrite.enums.OAuthProvider
import io.appwrite.extensions.createOAuth2Session


suspend fun IUserRepository.oauth2Login(): Result<Unit> {
    return (this as? UserRepository)?.oauth2Login()
        ?: Result.failure(Exception("Not Correct Class"))
}


suspend fun UserRepository.oauth2Login(): Result<Unit> = kotlin.runCatching {
    account.createOAuth2Session(
        provider = OAuthProvider.GOOGLE,
    )
    val session = account.getSession("current")
    val id = session.userId
    loadCurrentUser()

    return currentUser.value.onFailure {
        return runCatching {
            val userInfo = getGoogleUserInfo(session.providerAccessToken)
            val newUserData = UserDataDTO(
                firstName = userInfo.given_name,
                lastName = userInfo.family_name,
                userName = "${userInfo.given_name}${ID.unique()}",
                id = id,
                teamIds = listOf(),
                friendIds = listOf(),
                teamInvites = listOf(),
                eventInvites = listOf(),
                hasStripeAccount = false,
                uploadedImages = listOf(),
                friendRequestIds = listOf(),
                friendRequestSentIds = listOf(),
                followingIds = listOf()
            )
            database.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.USER_DATA_COLLECTION,
                documentId = id,
                data = newUserData,
                nestedType = UserDataDTO::class
            )
            loadCurrentUser()
        }
    }.map {}
}
