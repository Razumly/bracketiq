package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.Jersey: ImageVector
    get() {
        if (_Jersey != null) {
            return _Jersey!!
        }
        _Jersey = ImageVector.Builder(
            name = "Jersey",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            path(fill = SolidColor(Color(0xFF000000))) {
                moveTo(16.8f, 3f)
                lineToRelative(4.7f, 3.1f)
                lineToRelative(-2.1f, 4.2f)
                lineTo(18f, 9.6f)
                verticalLineTo(19f)
                curveToRelative(0f, 1.1f, -0.9f, 2f, -2f, 2f)
                horizontalLineTo(8f)
                curveToRelative(-1.1f, 0f, -2f, -0.9f, -2f, -2f)
                verticalLineTo(9.6f)
                lineToRelative(-1.4f, 0.7f)
                lineTo(2.5f, 6.1f)
                lineTo(7.2f, 3f)
                horizontalLineTo(10f)
                curveToRelative(0.2f, 1f, 1f, 1.7f, 2f, 1.7f)
                reflectiveCurveTo(13.8f, 4f, 14f, 3f)
                horizontalLineToRelative(2.8f)
                close()
            }
        }.build()

        return _Jersey!!
    }

@Suppress("ObjectPropertyName")
private var _Jersey: ImageVector? = null
