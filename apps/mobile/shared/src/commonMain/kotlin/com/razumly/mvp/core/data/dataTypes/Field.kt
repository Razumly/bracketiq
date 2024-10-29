package com.razumly.mvp.core.data.dataTypes

data class Field(
    val inUse: Boolean,
    val fieldNumber: Int,
    val divisions: List<String>,
    val matches: List<Match>,
    val tournament: String,
    override val id: String,
) : Document()