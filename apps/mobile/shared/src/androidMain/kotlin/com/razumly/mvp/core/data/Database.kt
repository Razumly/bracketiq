package com.razumly.mvp.core.data

import android.content.Context
import io.appwrite.Client
import io.appwrite.models.Document
import io.appwrite.models.User
import io.appwrite.services.Account
import io.appwrite.services.Databases
import io.github.aakira.napier.Napier

actual class Database(context: Context) {
    private val client: Client = Client(context)
        .setEndpoint("https://cloud.appwrite.io/v1") // Your API Endpoint
        .setProject("6656a4d60016b753f942") // Your project ID
        .setSelfSigned(true)
    private val account: Account = Account(client)

    actual val currentUser: UserData? = null

    private val database: Databases = Databases(client)
    actual suspend fun getTournament(tournamentId: String): Tournament? {
        var response: Document<Tournament>? = null
        try {
            response = database.getDocument(
                "mvp",
                "tournaments",
                tournamentId,
                queries = null,
                Tournament::class.java
            )
        } catch (e: Exception) {
            Napier.e("Failed to get tournament", e, "Database")
        }
        return response?.data
    }

    actual suspend fun getCurrentUser(): UserData? {
        val currentAccount: User<Map<String, Any>>
        try {
            currentAccount = account.get()
        } catch (e: Exception) {
            Napier.e("Failed to get current user", e, "Database")
            return null
        }
        return database.getDocument(
            "mvp",
            "userData",
            currentAccount.id,
            null,
            UserData::class.java
        ).data
    }

    actual suspend fun login(email: String, password: String): UserData? {
        account.createEmailPasswordSession(email, password)
        return database.getDocument(
            "mvp",
            "userData",
            account.get().id,
            null,
            UserData::class.java
        ).data
    }

    actual suspend fun logout() {
        account.deleteSessions()
    }

    actual suspend fun getTeam(teamId: String): Team? {
        TODO("Not yet implemented")
    }

    actual suspend fun getMatch(matchId: String): Match? {
        TODO("Not yet implemented")
    }

    actual suspend fun getField(fieldId: String): Field? {
        TODO("Not yet implemented")
    }
}