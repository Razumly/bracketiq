package com.razumly.mvp.core.data

interface UserData {
    val firstName: String
    val lastName: String
    val tournament: Tournament?
    val team: Team
}