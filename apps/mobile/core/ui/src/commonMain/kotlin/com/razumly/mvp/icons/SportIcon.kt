package com.razumly.mvp.icons

import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

private val sportNameWhitespace = Regex("\\s+")

fun getSportIconKey(sport: String?): String {
    val normalized = sport.orEmpty().trim().lowercase().replace(sportNameWhitespace, " ")
    SportIcons.keyForName(normalized)?.let { return it }

    // Keep alias precedence aligned with the site SportIcon boundary.
    return when {
        "volleyball" in normalized -> "indoor-volleyball"
        "soccer" in normalized -> "indoor-soccer"
        "pickleball" in normalized -> "pickleball"
        "badminton" in normalized -> "badminton"
        "racquetball" in normalized -> "racquetball"
        "field hockey" in normalized -> "field-hockey"
        "ball hockey" in normalized -> "ball-hockey"
        "hockey" in normalized -> "hockey"
        "lacrosse" in normalized -> "lacrosse"
        "australian football" in normalized -> "australian-football"
        "flag football" in normalized -> "flag-football"
        "football" in normalized -> "football"
        "futsal" in normalized -> "futsal"
        "table tennis" in normalized -> "table-tennis"
        "softball" in normalized -> "softball"
        "baseball" in normalized -> "baseball"
        "ultimate frisbee" in normalized -> "ultimate-frisbee"
        "tennis" in normalized -> "tennis"
        "basketball" in normalized -> "basketball"
        else -> "other"
    }
}

fun getSportIcon(sport: String?): ImageVector = SportIcons[getSportIconKey(sport)]

@Composable
fun SportIcon(
    sport: String?,
    modifier: Modifier = Modifier,
    contentDescription: String? = sport?.trim()?.takeIf(String::isNotBlank) ?: "Other",
    tint: Color = LocalContentColor.current,
) {
    Icon(
        imageVector = remember(sport) { getSportIcon(sport) },
        contentDescription = contentDescription,
        modifier = modifier,
        tint = tint,
    )
}
