package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.Remove24Px: ImageVector
    get() {
        if (_Remove24Px != null) {
            return _Remove24Px!!
        }
        _Remove24Px = ImageVector.Builder(
            name = "Remove24Px",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 960f,
            viewportHeight = 960f
        ).apply {
            path(fill = SolidColor(Color(0xFF000000))) {
                moveTo(200f, 520f)
                lineTo(200f, 440f)
                lineTo(760f, 440f)
                lineTo(760f, 520f)
                lineTo(200f, 520f)
                close()
            }
        }.build()

        return _Remove24Px!!
    }

@Suppress("ObjectPropertyName")
private var _Remove24Px: ImageVector? = null
