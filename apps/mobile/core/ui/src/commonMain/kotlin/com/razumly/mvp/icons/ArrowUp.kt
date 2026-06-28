package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ArrowUp: ImageVector
    get() {
        if (_ArrowUp != null) {
            return _ArrowUp!!
        }
        _ArrowUp = ImageVector.Builder(
            name = "ArrowUp",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color(0xFF0F0F0F))) {
                moveTo(18.293f, 15.289f)
                curveTo(18.683f, 14.899f, 18.683f, 14.266f, 18.293f, 13.875f)
                lineTo(13.401f, 8.988f)
                curveTo(12.62f, 8.207f, 11.354f, 8.208f, 10.573f, 8.988f)
                lineTo(5.683f, 13.879f)
                curveTo(5.292f, 14.269f, 5.292f, 14.902f, 5.683f, 15.293f)
                curveTo(6.073f, 15.684f, 6.706f, 15.684f, 7.097f, 15.293f)
                lineTo(11.282f, 11.107f)
                curveTo(11.673f, 10.717f, 12.306f, 10.717f, 12.697f, 11.107f)
                lineTo(16.879f, 15.289f)
                curveTo(17.269f, 15.68f, 17.902f, 15.68f, 18.293f, 15.289f)
                close()
            }
        }.build()

        return _ArrowUp!!
    }

@Suppress("ObjectPropertyName")
private var _ArrowUp: ImageVector? = null
