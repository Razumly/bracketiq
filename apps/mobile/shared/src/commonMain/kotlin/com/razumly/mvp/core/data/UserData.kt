package com.razumly.mvp.core.data

data class UserData(
    val firstName: String,
    val lastName: String,
    val tournament: Tournament?,
    val team: Team
)