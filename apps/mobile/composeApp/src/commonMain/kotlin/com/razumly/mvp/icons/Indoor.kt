package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.Indoor: ImageVector
    get() {
        if (_Indoor != null) {
            return _Indoor!!
        }
        _Indoor = ImageVector.Builder(
            name = "Indoor",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color(0xFF000000))) {
                moveTo(12f, 3f)
                lineTo(4f, 9f)
                verticalLineToRelative(12f)
                horizontalLineToRelative(5f)
                verticalLineToRelative(-7f)
                horizontalLineToRelative(6f)
                verticalLineToRelative(7f)
                horizontalLineToRelative(5f)
                verticalLineTo(9f)
                close()
            }
        }.build()

        return _Indoor!!
    }

@Suppress("ObjectPropertyName")
private var _Indoor: ImageVector? = null
