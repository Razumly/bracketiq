package com.razumly.mvp.core.util

import io.appwrite.models.Preferences
import io.appwrite.models.User

fun <T> User.Companion.empty(): User<Map<String, Any>> =
    User(
        id = "",
        createdAt = "",
        updatedAt = "",
        name = "",
        password = "",
        hash = "",
        hashOptions = "",
        registration = "",
        status = false,
        labels = listOf(),
        passwordUpdate = "",
        email = "",
        phone = "",
        emailVerification = false,
        phoneVerification = false,
        mfa = false,
        prefs = Preferences(mapOf()),
        targets = listOf(),
        accessedAt = ""
    )