package com.razumly.mvp.core.data

import androidx.activity.ComponentActivity
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.oauth2.Oauth2
import com.google.auth.http.HttpCredentialsAdapter
import com.google.auth.oauth2.AccessToken
import com.google.auth.oauth2.OAuth2Credentials
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toUserData
import com.razumly.mvp.core.util.DbConstants
import com.razumly.mvp.userAuth.util.getGoogleUserInfo
import io.appwrite.ID
import io.appwrite.enums.OAuthProvider
import io.appwrite.extensions.createOAuth2Session
import io.github.aakira.napier.Napier

suspend fun MVPRepository.oauth2Login(activity: ComponentActivity): UserWithRelations? {
    try {
        account.createOAuth2Session(
            provider = OAuthProvider.GOOGLE,
            activity = activity
        )
        val session = account.getSession("current")
        val id = session.userId
        try {
            val currentUser = database.getDocument(
                DbConstants.DATABASE_NAME,
                DbConstants.USER_DATA_COLLECTION,
                id,
                nestedType = UserDataDTO::class
            ).data.copy(id = id)
            tournamentDB.getUserDataDao.upsertUserData(currentUser.toUserData(id))
        } catch (e: Exception) {
            Napier.e("No user data ", e, DbConstants.ERROR_TAG)
            val userInfo = getGoogleUserInfo(session.providerAccessToken)
            database.createDocument(
                databaseId = DbConstants.DATABASE_NAME,
                collectionId = DbConstants.USER_DATA_COLLECTION,
                documentId = id,
                data = UserDataDTO(
                    firstName = userInfo.givenName,
                    lastName = userInfo.familyName,
                    tournamentIds = listOf(),
                    pickupGameIds = listOf(),
                    id = id
                ),
            )
        }

        val currentUserRelations =
            tournamentDB.getUserDataDao.getUserWithRelationsById(account.get().id)

        return currentUserRelations
    } catch (e: Exception) {
        Napier.e("Failed to login", e, DbConstants.ERROR_TAG)
        return null
    }
}