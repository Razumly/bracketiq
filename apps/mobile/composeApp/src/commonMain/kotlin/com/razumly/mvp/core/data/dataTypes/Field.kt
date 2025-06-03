package com.razumly.mvp.core.data.dataTypes

import androidx.room.Entity
import androidx.room.PrimaryKey
import io.appwrite.ID
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Entity
@Serializable
data class Field(
    val inUse: Boolean?,
    val fieldNumber: Int,
    val divisions: List<String>,
    val matches: List<String>,
    val tournamentId: String,
    @Transient
    @PrimaryKey
    override val id: String = "",
) : MVPDocument {
    companion object {
        operator fun invoke(tournamentId: String, fieldNumber: Int): Field {
            return Field(
                inUse = false,
                fieldNumber = fieldNumber,
                divisions = listOf(),
                matches = listOf(),
                tournamentId = tournamentId,
                id = ID.unique()
            )
        }
    }
}