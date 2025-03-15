package com.razumly.mvp.eventSearch.util

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.razumly.mvp.icons.Beach
import com.razumly.mvp.icons.Grass
import com.razumly.mvp.icons.Indoor
import com.razumly.mvp.icons.MVPIcons

class TextPatterns(title: String) {
    val divisions = listOf(
        TextPattern("NOVICE", Color(0xffa0c1ea), true, null),
        TextPattern("B", Color(0xffa0c1ea), true, null),
        TextPattern("BB", Color(0xffa0c1ea), true, null),
        TextPattern("A", Color(0xffa0c1ea), true, null),
        TextPattern("AA", Color(0xffa0c1ea), true, null),
        TextPattern("OPEN", Color(0xffa0c1ea), true, null)
    )
    val playerCounts = listOf(
        TextPattern("twos", Color(0xff5183ab), icon = Icons.Default.Person),
        TextPattern("quads", Color(0xffab5151), icon = Icons.Default.Person),
        TextPattern("pairs", Color(0xff5183ab), icon = Icons.Default.Person),
        TextPattern("doubles", Color(0xff5183ab), icon = Icons.Default.Person)
    )
    val fieldTypes = listOf(
        TextPattern("sand", Color(0xffb98e49), icon = MVPIcons.Beach),
        TextPattern("grass", Color(0xff62ab51), icon = MVPIcons.Grass),
        TextPattern("indoor", Color(0xff4f539d), icon = MVPIcons.Indoor),
    )
    val title = TextPattern(title, Color.Magenta)
}

data class TextPattern(
    val text: String,
    val color: Color,
    val caseSensitive: Boolean = false,
    val icon: ImageVector? = null
)