package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlin.time.ExperimentalTime

@Serializable
@Entity
@OptIn(ExperimentalTime::class)
data class ChatGroup(
    @Transient @PrimaryKey override val id: String = "",
    val name: String,
    val userIds: List<String>,
    val hostId: String,
) : MVPDocument, DisplayableEntity {
    override var imageUrl: String? = null
    override var displayName: String = ""
    fun setDisplayName(name: String): ChatGroup {
        displayName = name
        return this
    }

    fun setImageUrl(url: String?): ChatGroup {
        imageUrl = url
        return this
    }

    companion object {
        fun empty() = ChatGroup(
            id = "", name = "", userIds = listOf(), hostId = ""
        )
    }
}