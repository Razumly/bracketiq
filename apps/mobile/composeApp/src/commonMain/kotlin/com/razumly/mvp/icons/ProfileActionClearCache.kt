package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ProfileActionClearCache: ImageVector
    get() {
        if (_ProfileActionClearCache != null) {
            return _ProfileActionClearCache!!
        }
        _ProfileActionClearCache = ImageVector.Builder(
            name = "ProfileActionClearCache",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(19f, 8f)
                lineToRelative(1.41f, -1.41f)
                curveTo(19.27f, 5.45f, 17.72f, 4.5f, 16f, 4.5f)
                curveToRelative(-2.76f, 0f, -5f, 2.24f, -5f, 5f)
                horizontalLineTo(8f)
                lineToRelative(4f, 4f)
                lineToRelative(4f, -4f)
                horizontalLineToRelative(-3f)
                curveToRelative(0f, -1.66f, 1.34f, -3f, 3f, -3f)
                curveToRelative(0.83f, 0f, 1.58f, 0.34f, 2.12f, 0.88f)
                close()
                moveTo(6f, 16f)
                lineToRelative(-1.41f, 1.41f)
                curveTo(5.73f, 18.55f, 7.28f, 19.5f, 9f, 19.5f)
                curveToRelative(2.76f, 0f, 5f, -2.24f, 5f, -5f)
                horizontalLineToRelative(3f)
                lineToRelative(-4f, -4f)
                lineToRelative(-4f, 4f)
                horizontalLineToRelative(3f)
                curveToRelative(0f, 1.66f, -1.34f, 3f, -3f, 3f)
                curveToRelative(-0.83f, 0f, -1.58f, -0.34f, -2.12f, -0.88f)
                close()
            }
        }.build()

        return _ProfileActionClearCache!!
    }

@Suppress("ObjectPropertyName")
private var _ProfileActionClearCache: ImageVector? = null
