package com.razumly.mvp.core.data.dataTypes

import androidx.room.PrimaryKey

data class ChatGroup (
    @PrimaryKey override val id: String,
    val name: String?,
    val userIds: List<String>
): MVPDocument()