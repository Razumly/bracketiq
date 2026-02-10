package com.razumly.mvp.core.data

import androidx.activity.ComponentActivity
import com.razumly.mvp.core.data.repositories.IUserRepository

suspend fun IUserRepository.oauth2Login(activity: ComponentActivity): Result<Unit> {
    return Result.failure(
        NotImplementedError("Google OAuth is not supported in the Next.js auth flow yet.")
    )
}
