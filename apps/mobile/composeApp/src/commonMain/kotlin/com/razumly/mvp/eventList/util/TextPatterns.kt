package com.razumly.mvp.eventList.util

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

class TextPatterns(title: String) {
    val divisions = listOf(
        TextPattern("Novice", Color(0xff3c4b59), true, Icons.Default.Person,),
        TextPattern("B", Color(0xff3c4b59), true, Icons.Default.Person),
        TextPattern("BB", Color(0xff3c4b59), true, Icons.Default.Person),
        TextPattern("A", Color(0xff3c4b59), true, Icons.Default.Person),
        TextPattern("AA", Color(0xff3c4b59), true, Icons.Default.Person),
        TextPattern("Open", Color(0xff3c4b59), true, Icons.Default.Person)
    )
    val playerCounts = listOf(
        TextPattern("twos", Color(0xff5183ab), icon = Icons.Default.Person),
        TextPattern("quads", Color(0xffab5151), icon = Icons.Default.Person),
        TextPattern("pairs", Color(0xff5183ab), icon = Icons.Default.Person),
        TextPattern("doubles", Color(0xff5183ab), icon = Icons.Default.Person)
    )
    val fieldTypes = listOf(
        TextPattern("beach", Color(0xffb98e49), icon = Icons.Default.Person),
        TextPattern("grass", Color(0xff62ab51), icon = Icons.Default.Person),
        TextPattern("indoor", Color(0xff9d744f), icon = Icons.Default.Person),
    )
    val title = TextPattern(title, Color.Magenta)
}

data class TextPattern(val text: String, val color: Color, val caseSensitive: Boolean = false, val icon: ImageVector? = null)