package com.razumly.mvp.core.data

import androidx.activity.ComponentActivity
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.repositories.IUserRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.userAuth.util.getGoogleUserInfo
import io.appwrite.ID
import io.appwrite.enums.OAuthProvider
import io.appwrite.extensions.createOAuth2Session

suspend fun IUserRepository.oauth2Login(activity: ComponentActivity): Result<Unit> {
    return (this as? UserRepository)?.oauth2Login(activity)
        ?: Result.failure(Exception("Not Correct Class"))
}

suspend fun UserRepository.oauth2Login(activity: ComponentActivity): Result<Unit> = runCatching {
    account.createOAuth2Session(
        provider = OAuthProvider.GOOGLE, activity = activity
    )
    val session = account.getSession("current")
    val id = session.userId
    loadCurrentUser()

    return currentUser.value.onFailure {
        val userInfo = getGoogleUserInfo(session.providerAccessToken)
        database.createDocument(
            databaseId = DbConstants.DATABASE_NAME,
            collectionId = DbConstants.USER_DATA_COLLECTION,
            documentId = id,
            data = UserDataDTO(
                firstName = userInfo.givenName,
                lastName = userInfo.familyName,
                userName = "${userInfo.givenName}${ID.unique()}",
                id = id,
                tournamentIds = listOf(),
                eventIds = listOf(),
                teamIds = listOf(),
                friendIds = listOf(),
                teamInvites = listOf(),
                eventInvites = listOf(),
                tournamentInvites = listOf(),
                stripeAccountId = ""
            ),
            nestedType = UserDataDTO::class
        )
    }.map{}
}