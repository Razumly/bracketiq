package com.razumly.mvp.core.data

import com.razumly.mvp.core.data.repositories.IUserRepository


suspend fun IUserRepository.oauth2Login(): Result<Unit> {
    return Result.failure(
        NotImplementedError("Google OAuth is not supported in the Next.js auth flow yet.")
    )
}
