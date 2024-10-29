package com.razumly.mvp.core.data.dataTypes

data class UserData(
    val firstName: String,
    val lastName: String,
    val tournament: String,
    override val id: String,
) : Document()