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
            viewportWidth = 65f,
            viewportHeight = 55f
        ).apply {
            path(
                fill = SolidColor(Color(0xFF000000)),
                strokeLineWidth = 0.2f,
                strokeLineJoin = StrokeJoin.Round
            ) {
                moveTo(15.833f, 53.833f)
                lineTo(22.167f, 53.833f)
                lineTo(22.167f, 45.917f)
                lineTo(28.5f, 45.917f)
                lineTo(28.5f, 53.833f)
                lineTo(34.833f, 53.833f)
                lineTo(34.833f, 39.583f)
                lineTo(28.5f, 39.583f)
                lineTo(28.5f, 33.25f)
                lineTo(47.5f, 33.25f)
                lineTo(47.5f, 39.583f)
                lineTo(41.167f, 39.583f)
                lineTo(41.167f, 53.833f)
                lineTo(47.5f, 53.833f)
                lineTo(47.5f, 45.917f)
                lineTo(53.833f, 45.917f)
                lineTo(53.833f, 53.833f)
                lineTo(60.167f, 53.833f)
                lineTo(60.167f, 39.583f)
                lineTo(53.833f, 39.583f)
                lineTo(53.833f, 26.917f)
                lineTo(41.167f, 26.917f)
                lineTo(41.167f, 19f)
                lineTo(34.833f, 19f)
                lineTo(34.833f, 26.917f)
                lineTo(22.167f, 26.917f)
                lineTo(22.167f, 39.583f)
                lineTo(15.833f, 39.583f)
                lineTo(15.833f, 53.833f)
                close()
            }
        }.build()

        return _TournamentBracket!!
    }

@Suppress("ObjectPropertyName")
private var _TournamentBracket: ImageVector? = null
