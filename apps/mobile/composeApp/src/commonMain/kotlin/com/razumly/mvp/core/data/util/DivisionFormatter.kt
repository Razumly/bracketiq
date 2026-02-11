package com.razumly.mvp.core.data.util

private val whitespaceRegex = "\\s+".toRegex()

const val DEFAULT_DIVISION = "Novice"
val DEFAULT_DIVISION_OPTIONS = listOf("Novice", "B", "Bb", "A", "Aa", "Open")

fun String.normalizeDivisionLabel(): String {
    val trimmed = trim()
    if (trimmed.isEmpty()) return ""
    val singleSpace = trimmed.replace(whitespaceRegex, " ")
    val titleCased = singleSpace
        .lowercase()
        .split(" ")
        .filter { it.isNotBlank() }
        .joinToString(" ") { word ->
            word.replaceFirstChar { char ->
                if (char.isLowerCase()) char.uppercaseChar() else char
            }
        }
    return titleCased
}

fun List<String>.normalizeDivisionLabels(): List<String> =
    mapNotNull { value ->
        val normalized = value.normalizeDivisionLabel()
        normalized.takeIf { it.isNotEmpty() }
    }.distinct()
