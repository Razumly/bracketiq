package com.razumly.mvp.core.data

interface Field {
    val inUse: Boolean
    val fieldNumber: Int
    val divisions: List<String>
    val matches: List<Match>
    val tournament: Tournament
}