package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.TournamentBracket: ImageVector
    get() {
        if (_TournamentBracket != null) {
            return _TournamentBracket!!
        }
        _TournamentBracket = ImageVector.Builder(
            name = "TournamentBracket",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(
                fill = SolidColor(Color(0xFF000000)),
                strokeLineWidth = 0.2f,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(0f, 21.428f)
                lineTo(3.429f, 21.428f)
                lineTo(3.429f, 17.143f)
                lineTo(6.857f, 17.143f)
                lineTo(6.857f, 21.428f)
                lineTo(10.286f, 21.428f)
                lineTo(10.286f, 13.714f)
                lineTo(6.857f, 13.714f)
                lineTo(6.857f, 10.286f)
                lineTo(17.143f, 10.286f)
                lineTo(17.143f, 13.714f)
                lineTo(13.714f, 13.714f)
                lineTo(13.714f, 21.428f)
                lineTo(17.143f, 21.428f)
                lineTo(17.143f, 17.143f)
                lineTo(20.571f, 17.143f)
                lineTo(20.571f, 21.428f)
                lineTo(24f, 21.428f)
                lineTo(24f, 13.714f)
                lineTo(20.571f, 13.714f)
                lineTo(20.571f, 6.857f)
                lineTo(13.714f, 6.857f)
                lineTo(13.714f, 2.572f)
                lineTo(10.286f, 2.572f)
                lineTo(10.286f, 6.857f)
                lineTo(3.429f, 6.857f)
                lineTo(3.429f, 13.714f)
                lineTo(0f, 13.714f)
                lineTo(0f, 21.428f)
                close()
            }
        }.build()

        return _TournamentBracket!!
    }

@Suppress("ObjectPropertyName")
private var _TournamentBracket: ImageVector? = null
