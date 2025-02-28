package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toUserData
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.enums.OAuthProvider
import io.appwrite.extensions.createOAuth2Session
import io.github.aakira.napier.Napier

suspend fun MVPRepository.oauth2Login(): UserWithRelations? {
    try {
        account.createOAuth2Session(
            provider = OAuthProvider.GOOGLE,
        )
        val id = account.get().id
        val currentUser = database.getDocument(
            DbConstants.DATABASE_NAME,
            DbConstants.USER_DATA_COLLECTION,
            id,
            nestedType = UserDataDTO::class
        ).data.copy(id = id)
        tournamentDB.getUserDataDao.upsertUserData(currentUser.toUserData(id))
        val currentUserRelations =
            tournamentDB.getUserDataDao.getUserWithRelationsById(account.get().id)

        return currentUserRelations
    } catch (e: Exception) {
        Napier.e("Failed to login", e, DbConstants.ERROR_TAG)
        throw e
    }
}