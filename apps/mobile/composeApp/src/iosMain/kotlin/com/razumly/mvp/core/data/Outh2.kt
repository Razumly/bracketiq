package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.dataTypes.UserData
import com.razumly.mvp.core.data.dataTypes.UserWithRelations
import com.razumly.mvp.core.data.dataTypes.dtos.UserDataDTO
import com.razumly.mvp.core.data.dataTypes.dtos.toUserData
import com.razumly.mvp.core.data.repositories.IMVPRepository
import com.razumly.mvp.core.data.repositories.UserRepository
import com.razumly.mvp.core.util.DbConstants
import io.appwrite.enums.OAuthProvider
import io.appwrite.extensions.createOAuth2Session
import io.github.aakira.napier.Napier

suspend fun UserRepository.oauth2Login(): UserWithRelations? {
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

        return UserWithRelations(
            UserData(
                "name", "lastName", listOf(), listOf(), listOf(), listOf(), "suwew", listOf(),
                listOf(), listOf(), "sdsw"
            ),
            teams = listOf(),
            tournaments = listOf(),
            pickupGames = listOf()
        )
    } catch (e: Exception) {
        Napier.e("Failed to login", e, DbConstants.ERROR_TAG)
        throw e
    }
}