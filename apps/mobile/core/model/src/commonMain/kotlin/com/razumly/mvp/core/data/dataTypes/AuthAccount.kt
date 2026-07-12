package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable

@Serializable
data class AuthAccount(
    val id: String,
    val email: String,
    val name: String? = null,
    val isAdmin: Boolean = false,
) {
    companion object {
        fun empty(): AuthAccount = AuthAccount(id = "", email = "", name = null)
    }
}
