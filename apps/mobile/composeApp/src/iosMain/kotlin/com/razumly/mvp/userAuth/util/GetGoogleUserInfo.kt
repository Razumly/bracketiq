package com.razumly.mvp.userAuth.util

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

// Define a suspending function that will handle Google Sign-In and fetch user info.
fun getGoogleUserInfo(userToken: String): Flow<Result<Userinfo>> = flow {
    emit(Result.success(Userinfo("123", "john.c.calhoun@examplepetstore.com", "John Doe")))
}

// Userinfo data class example (map it according to what you need)
data class Userinfo(
    val id: String,
    val email: String,
    val name: String
)



