package com.razumly.mvp.userAuth.util

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.oauth2.Oauth2
import com.google.api.services.oauth2.model.Userinfo
import com.google.auth.http.HttpCredentialsAdapter
import com.google.auth.oauth2.AccessToken
import com.google.auth.oauth2.OAuth2Credentials
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

suspend fun getGoogleUserInfo(userToken: String): Userinfo {
    return withContext(Dispatchers.IO) {
        val googleNetHttpTransport = GoogleNetHttpTransport.newTrustedTransport()
        val googleJsonFactory = GsonFactory.getDefaultInstance()

        val oauth2Api = Oauth2.Builder(
            googleNetHttpTransport,
            googleJsonFactory,
            HttpCredentialsAdapter(
                OAuth2Credentials.create(
                    AccessToken(userToken, null)
                )
            )
        ).build()

        oauth2Api.Userinfo().v2().Me().get().execute()
    }
}
