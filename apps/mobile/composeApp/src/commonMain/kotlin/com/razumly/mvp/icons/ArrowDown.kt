package com.razumly.mvp.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

val MVPIcons.ArrowDown: ImageVector
    get() {
        if (_ArrowDown != null) {
            return _ArrowDown!!
        }
        _ArrowDown = ImageVector.Builder(
            name = "ArrowDown",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f
        ).apply {
            path(fill = SolidColor(Color(0xFF0F0F0F))) {
                moveTo(5.707f, 9.711f)
                curveTo(5.317f, 10.101f, 5.317f, 10.734f, 5.707f, 11.125f)
                lineTo(10.599f, 16.012f)
                curveTo(11.38f, 16.793f, 12.646f, 16.792f, 13.427f, 16.012f)
                lineTo(18.317f, 11.121f)
                curveTo(18.708f, 10.731f, 18.708f, 10.098f, 18.317f, 9.707f)
                curveTo(17.927f, 9.317f, 17.294f, 9.317f, 16.903f, 9.707f)
                lineTo(12.718f, 13.893f)
                curveTo(12.327f, 14.283f, 11.694f, 14.283f, 11.303f, 13.893f)
                lineTo(7.121f, 9.711f)
                curveTo(6.731f, 9.32f, 6.098f, 9.32f, 5.707f, 9.711f)
                close()
            }
        }.build()

        return _ArrowDown!!
    }

@Suppress("ObjectPropertyName")
private var _ArrowDown: ImageVector? = null
