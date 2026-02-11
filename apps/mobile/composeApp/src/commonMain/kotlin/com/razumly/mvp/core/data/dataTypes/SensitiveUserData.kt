package com.razumly.mvp.core.data.dataTypes

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
data class SensitiveUserData(
    val userId: String,
    val email: String,
    @Transient
    override val id: String = "",
) : MVPDocument
