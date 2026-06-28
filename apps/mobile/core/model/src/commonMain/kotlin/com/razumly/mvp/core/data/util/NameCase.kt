package com.razumly.mvp.core.data.util

fun String.toNameCase(): String {
    return this
        .trim()
        .split(Regex("\\s+"))
        .filter { token -> token.isNotBlank() }
        .joinToString(" ") { token ->
            token.replaceFirstChar { char ->
                if (char.isLowerCase()) char.titlecase() else char.toString()
            }
        }
}
